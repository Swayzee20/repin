-- Moderation v1: reports, blocks, soft removal, and terms-acceptance columns.
--
-- Apply after Drizzle migration 0014_moderation_reports_blocks.sql, which
-- creates content_reports and user_blocks and adds removed_at / removed_by
-- plus users.terms_accepted_at and users.terms_version. The API uses a role
-- that bypasses row level security. These policies close direct PostgREST
-- access with the publishable key.
--
-- Reports: a member may insert a report for someone else's post or comment
-- in a group they belong to. They can read only their own report rows.
-- They cannot update or delete them. A member insert that asks for the new
-- row back fails unless the SELECT policy allows that row; reporters may
-- read their own row, so RETURNING works for the reporter only.
-- Blocks: a signed-in user can read and write only rows they created as
-- the blocker, and cannot block themselves.
--
-- Team review of every open report (Supabase SQL editor, postgres role).
-- "Due in n h" is 24 hours after created_at. action taken is status
-- (removed or dismissed), with resolved_by and resolved_at.
--
--   select
--     r.created_at,
--     r.created_at + interval '24 hours' as due_at,
--     g.name as group_name,
--     r.group_id,
--     r.target_type,
--     r.target_id,
--     r.target_user_id,
--     r.reason,
--     r.details,
--     r.status,
--     r.resolved_at,
--     r.resolved_by,
--     reporter.display_name as reporter_name,
--     r.reporter_id
--   from public.content_reports as r
--   join public.groups as g on g.id = r.group_id
--   join public.users as reporter on reporter.id = r.reporter_id
--   where r.status = 'open'
--   order by r.created_at asc;

create or replace function private.report_target_is_valid(
  target_group_id uuid,
  target_type text,
  target_id uuid,
  target_user_id uuid
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
            and post.user_id = target_user_id
            and post.user_id <> auth.uid()
            and post.removed_at is null
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
            and comment.user_id = target_user_id
            and comment.user_id <> auth.uid()
            and comment.removed_at is null
            and post.removed_at is null
        )
      )
    );
$$;

revoke all on function private.report_target_is_valid(uuid, text, uuid, uuid) from public, anon;
grant execute on function private.report_target_is_valid(uuid, text, uuid, uuid) to authenticated;

alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;

revoke all on table public.content_reports from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;

grant select, insert, update, delete on table public.content_reports to authenticated;
grant select, insert, update, delete on table public.user_blocks to authenticated;

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own
on public.content_reports
for select
to authenticated
using (reporter_id = auth.uid());

drop policy if exists content_reports_insert_member on public.content_reports;
create policy content_reports_insert_member
on public.content_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and private.report_target_is_valid(group_id, target_type, target_id, target_user_id)
);

drop policy if exists content_reports_update_none on public.content_reports;
create policy content_reports_update_none
on public.content_reports
for update
to authenticated
using (false)
with check (false);

drop policy if exists content_reports_delete_none on public.content_reports;
create policy content_reports_delete_none
on public.content_reports
for delete
to authenticated
using (false);

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
