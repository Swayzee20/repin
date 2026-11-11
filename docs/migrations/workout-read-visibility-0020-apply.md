# Workout read visibility — apply 0020 + RLS

Josue applies this on the target Supabase database after the PR is approved.
Do not run it from CI or this PR. Do not apply it from an agent environment.
There is no backfill and no schema change. This tightens existing helpers and
SELECT policies.

These migrations are for the owner's review only. Do not use hosted credentials
from an agent environment.

## Apply order

1. **Diagnose** (read-only).
2. **Drizzle 0020** — `packages/db/drizzle/0020_workout_read_visibility.sql`.
3. **0020 verification** (read-only).
4. **RLS** — `supabase/migrations/20261111000000_workout_read_visibility.sql`
   in the SQL editor.
5. **Post-apply verification** — run
   [`workout-read-visibility-verify.sql`](./workout-read-visibility-verify.sql)
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
  to_regclass('public.workout_sessions')                 as sessions_table,
  to_regclass('public.community_posts')                  as posts_table,
  to_regclass('public.goals')                            as goals_table,
  to_regclass('drizzle.__drizzle_migrations')            as drizzle_tracking_table,
  to_regprocedure('private.can_access_community_post(uuid)') as can_access,
  to_regprocedure('private.can_read_workout_session(uuid)') as can_read_session,
  to_regprocedure('private.community_post_visible_to(uuid,uuid)') as new_predicate;
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

Compare the live `can_access` / `can_read_session` / `can_read_definition`
bodies to the baseline in the PR (Appendix A of the plan, main `0e44437`).
An unknown body needs review before replacement.

Do **not** skip the RLS migration solely because policy names already exist.
Compare live `pg_get_expr` predicates, helper bodies/ACL/`search_path`, and
ENABLE+FORCE flags to `supabase/migrations/20261111000000_workout_read_visibility.sql`.

Confirm the applying role already bypasses FORCE RLS. Do not add `BYPASSRLS`.

## 1. Apply Drizzle 0020

**Pick one.** 0020 only reasserts ENABLE+FORCE on existing tables. It is
idempotent.

### A. `db:migrate` (preferred when Drizzle tracking is already in use)

Export `DATABASE_URL` for the **target** Supabase database (not a local agent
or CI database):

```bash
export DATABASE_URL=postgresql://postgres:...@.../postgres
pnpm --filter @repin/db db:migrate
```

That applies every pending Drizzle migration, including
`0020_workout_read_visibility`, and records 0020 in
`drizzle.__drizzle_migrations`. Compare the applying-tool hash of the 0020
file; never invent a hash.

### B. SQL editor

Paste `packages/db/drizzle/0020_workout_read_visibility.sql` only if diagnose
showed 0020 missing from tracking and you will record 0020 in
`drizzle.__drizzle_migrations` yourself. Prefer A.

## 2. Verify 0020 (read-only)

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
    'workouts','workout_sessions','workout_session_metrics','workout_session_segments',
    'session_movement_results','set_results','workout_definitions','community_posts',
    'community_post_comments','community_post_reactions','personal_records',
    'community_post_prs','goals','goal_periods','community_post_goals'
  )
order by c.relname;
```

Expected: every named table has `rls_enabled` and `rls_forced` true.

## 3. Apply RLS

Paste `supabase/migrations/20261111000000_workout_read_visibility.sql` in the
SQL editor. It:

- preflights helpers, owners, FORCE capability, and SELECT policy counts
- replaces session/definition/post/comment/reaction/legacy/PR-badge read rules
- grants JWT wrappers to `authenticated`
- grants the three explicit-viewer predicates only to the applying
  (or `repin.visibility_api_role`) privileged role
- does **not** grant those viewer-id functions to `anon` / `authenticated`

If the preflight raises, stop and inspect. Do not transfer function ownership
or grant `BYPASSRLS` to force it through.

## 4. Verify RLS (read-only)

Run the full script:

[`docs/migrations/workout-read-visibility-verify.sql`](./workout-read-visibility-verify.sql)

It is `BEGIN READ ONLY` … `ROLLBACK`. Review mismatches; never auto-fix them.
Share the output with the PR author / Josue.

Expected highlights:

- Every listed table: ENABLE and FORCE true.
- Exactly one authenticated permissive SELECT policy per table; no extra
  SELECT/ALL policies.
- New helpers are SECURITY DEFINER, STABLE, empty `search_path`, owned by a
  role that already bypasses FORCE.
- `private.community_post_visible_to(uuid,uuid)` (and comment/reaction
  equivalents) are **not** executable by `anon` or `authenticated`.
- JWT wrappers (`can_access_community_post`, `can_read_workout_session`,
  `can_read_workout_definition`, `can_read_community_comment`,
  `can_read_community_reaction`) are executable by `authenticated` only.
- Owner private caches/goals stay SELECT-only for `authenticated`.
- Reviewed `prosrc` MD5 hashes match the table in the verify script. A
  formatting mismatch needs full-definition review, not a blind replace.

## Rollback

This restores the prior reviewed rules and **reopens the Section 2 gaps**.
It is a security downgrade and needs separate approval.

Prefer fail closed / pause peer reads and fix forward. Roll API code back
**before** dropping its new predicates. Keep Drizzle 0020 history; its
ENABLE/FORCE reassertion has nothing to undo. Capture pre-apply definitions
and ACLs first. No `CASCADE`, no disabling RLS, no deleting migration
tracking.

Forward SQL preserves existing helper owners and table grant shape. New
function grants disappear when dropped. API private-schema USAGE may already
have existed: restore that ACL only from captured before-state if newly
added and no remaining caller needs it; do not blindly revoke unrelated
access.

```sql
begin;
set local lock_timeout = '5s';
do $$
declare app_table text;
begin
  foreach app_table in array array[
    'workouts','movements','workout_definitions','workout_blocks','block_movements',
    'workout_sessions','workout_session_metrics','workout_session_segments',
    'session_movement_results','set_results','community_posts','community_post_comments',
    'community_post_reactions','personal_records','community_post_prs','goals',
    'goal_periods','community_post_goals','groups','group_members','users','user_blocks','content_reports'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', app_table);
    execute pg_catalog.format('alter table public.%I force row level security', app_table);
  end loop;
end $$;

create or replace function private.can_access_community_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_posts as post
    where post.id = target_post_id
      and private.is_group_member(post.group_id)
      and private.crew_content_visible(post.group_id, post.user_id, post.created_at)
  );
$$;

create or replace function private.can_read_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_session_id is not null
    and auth.uid() is not null
    and (
      private.owns_workout_session(target_session_id)
      or exists (
        select 1
        from public.community_posts as post
        where post.workout_session_id = target_session_id
          and private.is_group_member(post.group_id)
      )
    );
$$;

create or replace function private.can_read_workout_definition(target_definition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_definition_id is not null
    and auth.uid() is not null
    and (
      private.owns_workout_definition(target_definition_id)
      or exists (
        select 1
        from public.workout_sessions as session
        where session.workout_definition_id = target_definition_id
          and private.can_read_workout_session(session.id)
      )
    );
$$;

drop policy if exists workouts_select_own_or_group on public.workouts;
create policy workouts_select_own_or_group
on public.workouts
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_group_member(group_id)
);

drop policy if exists community_posts_select_member on public.community_posts;
create policy community_posts_select_member
on public.community_posts
for select
to authenticated
using (
  private.is_group_member(group_id)
  and private.crew_content_visible(group_id, user_id, created_at)
);

drop policy if exists community_post_comments_select_member on public.community_post_comments;
create policy community_post_comments_select_member
on public.community_post_comments
for select
to authenticated
using (
  private.can_access_community_post(community_post_id)
  and exists (
    select 1
    from public.community_posts as post
    where post.id = community_post_id
      and private.crew_content_visible(
        post.group_id,
        community_post_comments.user_id,
        community_post_comments.created_at
      )
  )
);

drop policy if exists community_post_reactions_select_member on public.community_post_reactions;
create policy community_post_reactions_select_member
on public.community_post_reactions
for select
to authenticated
using (
  private.can_access_community_post(community_post_id)
  and exists (
    select 1
    from public.community_posts as post
    where post.id = community_post_id
      and private.crew_content_visible(
        post.group_id,
        community_post_reactions.user_id,
        community_post_reactions.created_at
      )
  )
);

drop policy if exists community_post_prs_select_member on public.community_post_prs;
create policy community_post_prs_select_member
on public.community_post_prs
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    private.can_access_community_post(post_id)
    and exists (
      select 1
      from public.community_posts as post
      where post.id = community_post_prs.post_id
        and post.removed_at is null
    )
    and not private.is_blocked_between(auth.uid(), community_post_prs.user_id)
  )
);

drop function if exists private.can_read_community_comment(uuid);
drop function if exists private.can_read_community_reaction(uuid);
drop function if exists private.community_comment_visible_to(uuid,uuid);
drop function if exists private.community_reaction_visible_to(uuid,uuid);
drop function if exists private.community_post_visible_to(uuid,uuid);
commit;
```
