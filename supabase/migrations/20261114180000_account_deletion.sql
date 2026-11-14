-- Account deletion M1/M2. Apply after Drizzle 0022_mixed_chronomancer.sql
-- and 0023_dry_shocker.sql.
--
-- Schema changes live in those Drizzle files:
--   M1: content_reports.reporter_id drops NOT NULL; FK ON DELETE SET NULL.
--   M2: group_members.owner_notice_at timestamptz NULL (no index).
-- This file does not alter policies, disable RLS, grant extra rights, or
-- use BYPASSRLS. Nameless reports stay invisible to authenticated clients
-- because content_reports_select_own still requires reporter_id = auth.uid().

do $$
begin
  if to_regclass('public.content_reports') is null
     or to_regclass('public.group_members') is null then
    raise exception 'content_reports and group_members are required.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_reports'
      and column_name = 'reporter_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Apply Drizzle 0022_mixed_chronomancer.sql before this migration.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'group_members'
      and column_name = 'owner_notice_at'
  ) then
    raise exception 'Apply Drizzle 0023_dry_shocker.sql before this migration.';
  end if;
end $$;
