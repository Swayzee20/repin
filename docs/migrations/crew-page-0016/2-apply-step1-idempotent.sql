-- Idempotent equivalent of packages/db/drizzle/0016_modern_layla_miller.sql.
-- Safe to re-run: skips anything that already exists. All-or-nothing (one transaction).
begin;

create table if not exists public.crew_notification_prefs (
  user_id    uuid    not null,
  group_id   uuid    not null,
  alert_type text    not null,
  enabled    boolean not null default true,
  constraint crew_notification_prefs_user_id_group_id_alert_type_pk primary key (user_id, group_id, alert_type),
  constraint crew_notification_prefs_alert_type_check
    check (alert_type in ('crew_workout', 'crew_comment', 'crew_reaction', 'mute_all'))
);

alter table public.group_members add column if not exists left_at timestamp with time zone;
alter table public.group_members add column if not exists content_visible_after timestamp with time zone not null default '-infinity';
alter table public.groups        add column if not exists photo_path text;
alter table public.groups        add column if not exists closed_at  timestamp with time zone;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_notification_prefs_user_id_users_id_fk') then
    alter table public.crew_notification_prefs
      add constraint crew_notification_prefs_user_id_users_id_fk
      foreign key (user_id) references public.users(id) on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crew_notification_prefs_group_id_groups_id_fk') then
    alter table public.crew_notification_prefs
      add constraint crew_notification_prefs_group_id_groups_id_fk
      foreign key (group_id) references public.groups(id) on delete cascade on update no action;
  end if;
end $$;

create index if not exists crew_notification_prefs_group_id_idx on public.crew_notification_prefs using btree (group_id);
create index if not exists group_members_group_active_idx    on public.group_members          using btree (group_id);

commit;
