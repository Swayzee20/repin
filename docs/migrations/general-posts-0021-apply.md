# General posts — apply 0021 + RLS

Josue applies this on the target Supabase database after the PR is approved.
Do not run it from CI or this PR. Do not apply it from an agent environment.
Friday will bring each migration to him. Take a backup first.

These migrations are for the owner's review only. Do not use hosted credentials
from an agent environment.

This adds general (non-workout) community posts: `kind` on `community_posts`,
shared `general_publications` (text, photos, extracted links), one crew-scoped
post row per destination crew, one pin slot per crew, report-evidence
retention (including account-erasure J11), `crew_post` alerts, and push
dedupe storage. Link preview fetching is not included.

## Apply order

1. **Diagnose** (read-only).
2. **Backup** the target database.
3. **Drizzle 0021** — `packages/db/drizzle/0021_general_posts.sql`.
4. **0021 verification** (read-only).
5. **RLS** — `supabase/migrations/20261112000000_general_posts.sql`
   in the SQL editor.
6. **Post-apply verification** — run
   [`general-posts-verify.sql`](./general-posts-verify.sql)
   (`BEGIN READ ONLY` … `ROLLBACK`) and share the output.

The Supabase SQL editor and `drizzle-kit migrate` (`pnpm --filter @repin/db
db:migrate`) each run in a **single transaction**. If a run fails, Postgres
rolls it back.

If the live `DATABASE_URL` role is not the applying role, insert
`SET LOCAL repin.visibility_api_role = 'verified_existing_role'` after `BEGIN`
and before the preflight in the RLS file. Never grant `BYPASSRLS` to make the
preflight pass.

## 0. Diagnose (read-only)

Changes nothing.

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  to_regclass('public.community_posts')                       as posts_table,
  to_regclass('public.general_publications')                  as publications_table,
  to_regclass('public.crew_pinned_posts')                     as pins_table,
  to_regclass('public.content_report_evidence')               as evidence_table,
  to_regclass('drizzle.__drizzle_migrations')                 as drizzle_tracking_table,
  to_regprocedure('private.community_post_visible_to(uuid,uuid)') as post_predicate,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'community_posts'
      and column_name = 'kind'
  ) as has_kind_column;
```

If `drizzle_tracking_table` is not null, run this second read-only query. Do not
run it when tracking is missing: PostgreSQL still parses
`drizzle.__drizzle_migrations` inside `EXISTS` even when guarded by
`to_regclass`.

```sql
-- READ-ONLY. Run only when drizzle_tracking_table is not null.
select id, hash, created_at
from drizzle.__drizzle_migrations
order by created_at desc;
```

Confirm 0020 / `20261111000000_workout_read_visibility` is already applied.
Confirm the applying role already bypasses FORCE RLS. Do not add `BYPASSRLS`.

## 1. Apply Drizzle 0021

**Pick one.**

### A. `db:migrate` (preferred when Drizzle tracking is already in use)

Export `DATABASE_URL` for the **target** Supabase database (not a local agent
or CI database):

```bash
export DATABASE_URL=postgresql://postgres:...@.../postgres
pnpm --filter @repin/db db:migrate
```

That applies every pending Drizzle migration, including
`0021_general_posts`, and records 0021 in
`drizzle.__drizzle_migrations`. Compare the applying-tool hash of the 0021
file; never invent a hash.

### B. SQL editor

Paste `packages/db/drizzle/0021_general_posts.sql` only if diagnose
showed 0021 missing from tracking and you will record 0021 in
`drizzle.__drizzle_migrations` yourself. Prefer A.

## 2. Verify 0021 (read-only)

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'community_posts','general_publications','general_publication_photos',
    'general_publication_links','general_publication_upload_reservations',
    'crew_pinned_posts','content_report_evidence','push_notification_dedupe'
  )
order by c.relname;
```

Expected after Drizzle: the new tables exist and have RLS enabled. FORCE is
applied in step 3.

```sql
-- READ-ONLY. Existing workout posts still have a session and kind workout.
select kind, count(*) as n
from public.community_posts
group by kind;
```

Expected: every pre-existing row is `workout`.

## 3. Apply RLS

Paste `supabase/migrations/20261112000000_general_posts.sql` in the
SQL editor. It:

- preflights helpers, tables, and `community_posts.kind`
- replaces `private.community_post_visible_to` with a workout **or**
  general-post branch (workout session/author checks stay)
- adds `private.general_publication_visible_to` and JWT wrappers
- ENABLE + FORCE on every new table
- grants SELECT on publications/photos/links/reservations/pins to
  `authenticated`; evidence and push-dedupe stay API-only
- tightens client DML so authenticated users cannot insert or update
  `kind = 'general'` community posts
- grants the explicit-viewer predicates only to the applying
  (or `repin.visibility_api_role`) privileged role

If the preflight raises, stop and inspect. Do not transfer function ownership
or grant `BYPASSRLS` to force it through.

## 4. Verify RLS (read-only)

Run the full script:

[`docs/migrations/general-posts-verify.sql`](./general-posts-verify.sql)

It is `BEGIN READ ONLY` … `ROLLBACK`. Review mismatches; never auto-fix them.
Share the output with the PR author / Josue.

Expected highlights:

- New tables: ENABLE and FORCE true.
- `community_posts.kind` exists; workout rows still require a session.
- `private.community_post_visible_to` is SECURITY DEFINER, STABLE, empty
  `search_path`, and **not** executable by `anon` or `authenticated`.
- JWT wrappers `can_access_community_post` and
  `can_access_general_publication` are executable by `authenticated` only.
- Evidence and push-dedupe have no authenticated policies.
- Client insert into `community_posts` still requires `kind = 'workout'`.

## Rollback

This removes general-post tables and restores the workout-only visibility
predicate. It is a data-loss operation for any general posts created after
apply and needs separate approval.

Prefer fail closed / pause general-post routes and fix forward. Roll API
code back **before** dropping tables. Capture pre-apply definitions first.
No `CASCADE` on unrelated objects, no disabling RLS, no deleting migration
tracking unless Josue asks.

Do not run a rollback from this PR.
