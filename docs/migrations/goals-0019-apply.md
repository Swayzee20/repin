# Goals v1 — apply 0019 + RLS

Josue applies this on the target Supabase database after the PR is approved.
Do not run it from CI or this PR. Do not apply it from an agent environment.
There is no backfill.

## Apply order

1. **Diagnose** (read-only).
2. **Drizzle 0019** — `packages/db/drizzle/0019_ancient_wind_dancer.sql`.
3. **0019 verification** (read-only).
4. **RLS** — `supabase/migrations/20261110000000_goals.sql` in the SQL editor.
5. **RLS verification** (read-only).

The Supabase SQL editor and `drizzle-kit migrate` (`pnpm --filter @repin/db
db:migrate`) each run in a **single transaction**. If a run fails, Postgres
rolls it back.

## 0. Diagnose (read-only)

Changes nothing.

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  to_regclass('public.goals')                    as goals_table,
  to_regclass('public.goal_periods')             as goal_periods_table,
  to_regclass('public.community_post_goals')     as community_post_goals_table,
  to_regclass('drizzle.__drizzle_migrations')    as drizzle_tracking_table,
  exists (
    select 1
    from drizzle.__drizzle_migrations
    where hash is not null
      and created_at is not null
  ) as drizzle_has_rows;
```

If `goals_table` is already present, skip step 1 and go to verification.
If the RLS policies listed in step 4 already exist, skip step 3.

## 1. Apply Drizzle 0019

**Pick one.** Do not paste the raw Drizzle file into the SQL editor unless
you are sure it has never been applied: that file is not idempotent.

### A. `db:migrate` (preferred when Drizzle tracking is already in use)

Export `DATABASE_URL` for the **target** Supabase database (not a local agent
or CI database):

```bash
export DATABASE_URL=postgresql://postgres:...@.../postgres
pnpm --filter @repin/db db:migrate
```

That applies every pending Drizzle migration, including
`0019_ancient_wind_dancer`, and records 0019 in
`drizzle.__drizzle_migrations`.

### B. SQL editor

Paste `packages/db/drizzle/0019_ancient_wind_dancer.sql` only if diagnose showed
the three tables missing and you will record 0019 in
`drizzle.__drizzle_migrations` yourself. Prefer A.

## 2. Verify 0019 (read-only)

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  to_regclass('public.goals')                as goals_table,
  to_regclass('public.goal_periods')         as goal_periods_table,
  to_regclass('public.community_post_goals') as community_post_goals_table;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.goals'::regclass,
  'public.goal_periods'::regclass,
  'public.community_post_goals'::regclass
)
order by conrelid::regclass::text, conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('goals', 'goal_periods', 'community_post_goals')
order by tablename, indexname;
```

Expected:

- `goals_user_active_slot_unique` on `(user_id, active_slot)` where
  `active_slot is not null`.
- `goals_slot_state_check`: active rows have `active_slot` between 1 and 5;
  inactive rows have a null slot.
- `community_post_goals_period_unique` (one post per completion).

## 3. Apply RLS

Paste `supabase/migrations/20261110000000_goals.sql` in the SQL editor.
It ENABLE + FORCE RLS on all three tables, grants authenticated SELECT only,
and adds owner / crew-visibility SELECT policies. It raises if 0019 or the
#55 helpers are missing.

## 4. Verify RLS (read-only)

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('goals', 'goal_periods', 'community_post_goals')
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('goals', 'goal_periods', 'community_post_goals')
order by tablename, policyname;

select
  table_name,
  privilege_type,
  grantee
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('goals', 'goal_periods', 'community_post_goals')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

select
  n.nspname as schema,
  p.proname as function,
  p.prosecdef as security_definer,
  p.provolatile as volatility
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'can_access_community_post',
    'is_blocked_between',
    'is_group_member',
    'crew_content_visible'
  )
order by p.proname;
```

Expected:

- All three tables: `rls_enabled` and `rls_forced` are true.
- Policies are SELECT-only (`cmd = 'SELECT'`). No insert/update/delete policies.
- `authenticated` has SELECT only. `anon` and `PUBLIC` have no grants.
- `private.can_access_community_post` and `private.is_blocked_between` are
  SECURITY DEFINER (`security_definer = true`) and STABLE (`volatility = 's'`).
