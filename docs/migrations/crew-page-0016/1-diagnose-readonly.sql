-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  to_regclass('public.crew_notification_prefs')            as prefs_table,
  to_regclass('public.crew_notification_prefs_group_id_idx') as prefs_index,
  to_regclass('public.group_members_group_active_idx')     as gm_index,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups'        and column_name='photo_path')            as groups_photo_path,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups'        and column_name='closed_at')             as groups_closed_at,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='group_members' and column_name='left_at')               as gm_left_at,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='group_members' and column_name='content_visible_after') as gm_content_visible_after,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crew_content_visible') as step2_ran,
  to_regclass('drizzle.__drizzle_migrations')              as drizzle_tracking_table;
