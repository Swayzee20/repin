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
  to_regclass('drizzle.__drizzle_migrations')    as drizzle_tracking_table;
```

If `drizzle_tracking_table` is not null, run this second read-only query. Do not run it
when tracking is missing: PostgreSQL still parses `drizzle.__drizzle_migrations`
inside `EXISTS` even when guarded by `to_regclass`.

```sql
-- READ-ONLY. Run only when drizzle_tracking_table is not null.
select exists (
  select 1
  from drizzle.__drizzle_migrations
  where hash is not null
    and created_at is not null
) as drizzle_has_rows;
```

If `goals_table` is already present, do **not** skip Drizzle 0019 until
verification confirms the journal hash for tag `0019_ancient_wind_dancer`
and `goals_slot_state_check` (active rows require `active_slot IS NOT NULL
AND BETWEEN 1 AND 5`). Table presence alone can be an older draft.

Do **not** skip the RLS migration solely because policy names already exist.
Compare live `pg_get_expr` predicates, helper bodies/ACL/`search_path`, and
ENABLE+FORCE flags to `supabase/migrations/20261110000000_goals.sql`. An
older draft may have installed weaker policies under the same names.

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
- `goals_slot_state_check`: active rows have `active_slot IS NOT NULL AND
  between 1 and 5`; inactive rows have a null slot. PostgreSQL CHECK accepts
  NULL, so the IS NOT NULL clause is required.
- `goals_archived_at_check`: archived rows have `archived_at IS NOT NULL`;
  every other state has a null cutoff.
- `goal_periods.archive_cutoff_at`: nullable timestamptz stamped once when
  the parent goal is archived (`WHERE archive_cutoff_at IS NULL`). Historical
  revalidation uses this cutoff after reopen.
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
    'crew_content_visible',
    'goal_badge_post_visible'
  )
order by p.proname;

-- Resolve objects without casting missing names to regclass.
select to_regclass('public.goals') as goals_table,
       to_regclass('public.goal_periods') as periods_table,
       to_regclass('public.community_post_goals') as badges_table,
       to_regclass('drizzle.__drizzle_migrations') as migration_tracking_table,
       to_regprocedure('private.can_access_community_post(uuid)') as visibility_helper,
       to_regprocedure('private.is_blocked_between(uuid,uuid)') as blocks_helper,
       to_regprocedure('private.goal_badge_post_visible(uuid)') as goal_badge_helper;

-- Effective role permissions. authenticated SELECT=true, other flags=false; anon all false.
with target as (
  select c.oid, n.nspname, c.relname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('goals','goal_periods','community_post_goals')
), roles as (select oid,rolname from pg_roles where rolname in ('anon','authenticated'))
select t.relname, r.rolname,
       has_table_privilege(r.oid,t.oid,'SELECT') as can_select,
       has_table_privilege(r.oid,t.oid,'INSERT') as can_insert,
       has_table_privilege(r.oid,t.oid,'UPDATE') as can_update,
       has_table_privilege(r.oid,t.oid,'DELETE') as can_delete,
       has_table_privilege(r.oid,t.oid,'TRUNCATE') as can_truncate,
       has_table_privilege(r.oid,t.oid,'REFERENCES') as can_reference,
       has_table_privilege(r.oid,t.oid,'TRIGGER') as can_trigger,
       exists(select 1 from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
              and (has_column_privilege(r.oid,t.oid,a.attnum,'INSERT')
                   or has_column_privilege(r.oid,t.oid,a.attnum,'UPDATE')
                   or has_column_privilege(r.oid,t.oid,a.attnum,'REFERENCES'))) as any_column_write_grant
from target t cross join roles r order by t.relname,r.rolname;

-- Explicit PUBLIC table/column ACLs: expected no rows.
select c.relname, 'table' as acl_scope, null::text as column_name, acl.privilege_type
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
where n.nspname='public' and c.relname in ('goals','goal_periods','community_post_goals') and acl.grantee=0
union all
select c.relname, 'column', a.attname::text, acl.privilege_type
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) acl
where n.nspname='public' and c.relname in ('goals','goal_periods','community_post_goals') and acl.grantee=0;

-- Helper body, fixed search_path, execution grants and definer RLS bypass.
-- SECURITY DEFINER=true, STABLE='s', search_path empty; authenticated execute=true;
-- anon/PUBLIC execute=false. Include any private helper whose name contains 'goal'.
select p.oid::regprocedure as helper,p.prosecdef,p.provolatile,p.proconfig,
       owner_role.rolname as owner_role,owner_role.rolsuper,owner_role.rolbypassrls,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
              where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner_role on owner_role.oid=p.proowner
where n.nspname='private' and (
  p.proname in ('can_access_community_post','is_blocked_between','is_group_member','crew_content_visible','goal_badge_post_visible')
  or p.proname ilike '%goal%'
) order by p.oid::regprocedure::text;

-- Raw policy expressions. Badge non-owner branch must call goal_badge_post_visible
-- (not an inline community_posts.removed_at SELECT) plus is_blocked_between.
select c.relname,p.polname,p.polcmd,p.polpermissive,
       array(select rolname from pg_roles where oid=any(p.polroles)) as roles,
       pg_get_expr(p.polqual,p.polrelid) as using_predicate,
       pg_get_expr(p.polwithcheck,p.polrelid) as with_check_predicate
from pg_policy p join pg_class c on c.oid=p.polrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('goals','goal_periods','community_post_goals')
order by c.relname,p.polname;

-- Slot CHECK truth table. PostgreSQL CHECK rejects FALSE and accepts TRUE/NULL.
-- The live constraint must match required_result (active_slot IS NOT NULL).
select state,slot,
       ((state='active' and slot between 1 and 5)
         or (state<>'active' and slot is null)) as old_loophole_result,
       ((state='active' and slot is not null and slot between 1 and 5)
         or (state<>'active' and slot is null)) as required_result
from (values ('active',null::int),('active',1),('active',5),('active',6),('archived',null::int),('archived',1)) x(state,slot);
```

Expected:

- All three tables: `rls_enabled` and `rls_forced` are true.
- Policies are SELECT-only (`cmd = 'SELECT'`). No insert/update/delete policies.
- `authenticated` has SELECT only. `anon` and `PUBLIC` have no grants.
- `private.can_access_community_post`, `private.is_blocked_between`, and
  `private.goal_badge_post_visible` are SECURITY DEFINER
  (`security_definer = true`) and STABLE (`volatility = 's'`), with a fixed
  empty `search_path`. authenticated EXECUTE only; anon/PUBLIC EXECUTE false.
- The Goal badge policy must call `goal_badge_post_visible` rather than an
  inline `community_posts.removed_at` SELECT.
- Slot CHECK truth table: `active` + NULL is false under `required_result`.
  Confirm `pg_get_constraintdef` for `goals_slot_state_check` includes
  `active_slot IS NOT NULL`.
