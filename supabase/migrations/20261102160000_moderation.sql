-- Moderation v1: content reports and user blocks.
--
-- Apply after the Drizzle migration that creates public.content_reports and
-- public.user_blocks. The API uses a role that bypasses row level security.
-- These policies close direct PostgREST access with the publishable key.
--
-- Reports: a member may insert a report only for someone else's post or
-- comment in a group they belong to. Only that group's owner can read,
-- update, or delete the group's report rows. A member insert that asks
-- for the new row back (INSERT ... RETURNING, or PostgREST
-- return=representation) fails, because the reporter cannot read it.
-- Use return=minimal. The app writes reports through the API instead.
-- Blocks: a signed-in user can read, insert, update, and delete only rows
-- where they are the blocker, and cannot block themselves.
--
-- Developer review of every open report (Supabase SQL editor, postgres role):
--
--   select
--     r.created_at,
--     g.name as group_name,
--     r.group_id,
--     r.target_type,
--     r.target_id,
--     r.reason,
--     r.note,
--     r.status,
--     reporter.display_name as reporter_name,
--     r.reporter_id
--   from public.content_reports as r
--   join public.groups as g on g.id = r.group_id
--   join public.users as reporter on reporter.id = r.reporter_id
--   where r.status = 'open'
--   order by r.created_at asc;

create or replace function private.is_group_owner(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_group_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = auth.uid()
        and role = 'owner'
    );
$$;

create or replace function private.report_target_is_valid(
  target_group_id uuid,
  target_type text,
  target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and private.is_group_member(target_group_id)
    and (
      (
        target_type = 'post'
        and exists (
          select 1
          from public.community_posts as post
          where post.id = target_id
            and post.group_id = target_group_id
            and post.user_id <> auth.uid()
        )
      )
      or (
        target_type = 'comment'
        and exists (
          select 1
          from public.community_post_comments as comment
          join public.community_posts as post
            on post.id = comment.community_post_id
          where comment.id = target_id
            and post.group_id = target_group_id
            and comment.user_id <> auth.uid()
        )
      )
    );
$$;

revoke all on function private.is_group_owner(uuid) from public, anon;
revoke all on function private.report_target_is_valid(uuid, text, uuid) from public, anon;
grant execute on function private.is_group_owner(uuid) to authenticated;
grant execute on function private.report_target_is_valid(uuid, text, uuid) to authenticated;

alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;

revoke all on table public.content_reports from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;

grant select, insert, update, delete on table public.content_reports to authenticated;
grant select, insert, update, delete on table public.user_blocks to authenticated;

drop policy if exists content_reports_select_owner on public.content_reports;
create policy content_reports_select_owner
on public.content_reports
for select
to authenticated
using (private.is_group_owner(group_id));

drop policy if exists content_reports_insert_member on public.content_reports;
create policy content_reports_insert_member
on public.content_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and private.report_target_is_valid(group_id, target_type, target_id)
);

drop policy if exists content_reports_update_owner on public.content_reports;
create policy content_reports_update_owner
on public.content_reports
for update
to authenticated
using (private.is_group_owner(group_id))
with check (private.is_group_owner(group_id));

drop policy if exists content_reports_delete_owner on public.content_reports;
create policy content_reports_delete_owner
on public.content_reports
for delete
to authenticated
using (private.is_group_owner(group_id));

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
on public.user_blocks
for insert
to authenticated
with check (
  blocker_id = auth.uid()
  and blocker_id <> blocked_id
);

drop policy if exists user_blocks_update_own on public.user_blocks;
create policy user_blocks_update_own
on public.user_blocks
for update
to authenticated
using (blocker_id = auth.uid())
with check (
  blocker_id = auth.uid()
  and blocker_id <> blocked_id
);

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
on public.user_blocks
for delete
to authenticated
using (blocker_id = auth.uid());
