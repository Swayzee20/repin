-- READ-ONLY. Corrected verification for step 1 (no ::regclass cast, so it can't error if the table is missing).
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'groups' and column_name in ('photo_path','closed_at'))
    or (table_name = 'group_members' and column_name in ('left_at','content_visible_after')))
order by table_name, column_name;

select c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'crew_notification_prefs'
order by c.conname;
