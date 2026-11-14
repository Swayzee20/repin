-- Verify M1 (filed reports stay nameless) and M2 (owner-notice flag).
-- Run against the same database after drizzle 0022 + 0023. Do not apply
-- those migrations to live Supabase until Josue approves and takes a backup.

do $$
declare
  reporter_nullable text;
  reporter_delete_rule text;
  unique_index_ok boolean;
  notice_nullable text;
  notice_index_count int;
  reports_forced boolean;
  members_forced boolean;
begin
  select is_nullable into reporter_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'content_reports'
    and column_name = 'reporter_id';
  if reporter_nullable is distinct from 'YES' then
    raise exception 'M1: content_reports.reporter_id must be nullable';
  end if;

  select rc.delete_rule into reporter_delete_rule
  from information_schema.referential_constraints rc
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'content_reports_reporter_id_users_id_fk';
  if reporter_delete_rule is distinct from 'SET NULL' then
    raise exception 'M1: content_reports_reporter_id_users_id_fk must be ON DELETE SET NULL';
  end if;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'content_reports_reporter_target_unique'
  ) into unique_index_ok;
  if not unique_index_ok then
    raise exception 'M1: content_reports_reporter_target_unique must still exist';
  end if;

  select is_nullable into notice_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'group_members'
    and column_name = 'owner_notice_at';
  if notice_nullable is distinct from 'YES' then
    raise exception 'M2: group_members.owner_notice_at must exist and be nullable';
  end if;

  select count(*)::int into notice_index_count
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'group_members'
    and indexdef ilike '%owner_notice_at%';
  if notice_index_count <> 0 then
    raise exception 'M2: group_members.owner_notice_at must not have an index';
  end if;

  select c.relforcerowsecurity into reports_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'content_reports';
  if reports_forced is not true then
    raise exception 'RLS must stay forced on content_reports';
  end if;

  select c.relforcerowsecurity into members_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'group_members';
  if members_forced is not true then
    raise exception 'RLS must stay forced on group_members';
  end if;
end $$;
