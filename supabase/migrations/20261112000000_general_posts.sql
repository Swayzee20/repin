-- General posts: canonical visibility branch, RLS, grants, and client DML
-- safeguards. Apply after Drizzle 0021_general_posts.sql.
--
-- The API role bypasses RLS. Every API query must still use
-- private.community_post_visible_to (and the matching TypeScript helpers).
-- Making workout_session_id nullable is not enough: this file adds an
-- explicit general-post branch while keeping the workout session/author
-- checks unchanged.
--
-- New application tables get ENABLE + FORCE RLS. authenticated may SELECT
-- publication content only through a fully visible crew copy (or as author).
-- Pins are readable by current crew members. Upload reservations are
-- author-SELECT only. Report evidence and push-dedupe are API-only (no
-- authenticated policies). There are no client INSERT/UPDATE/DELETE policies
-- on general-post tables; writes stay on DATABASE_URL.

do $$
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception
      'auth.uid() is required. Apply this migration on Supabase, where the auth schema already exists.';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception
      'Supabase roles anon and authenticated are required before enabling row level security.';
  end if;

  if to_regclass('public.general_publications') is null
     or to_regclass('public.general_publication_photos') is null
     or to_regclass('public.general_publication_links') is null
     or to_regclass('public.general_publication_upload_reservations') is null
     or to_regclass('public.crew_pinned_posts') is null
     or to_regclass('public.content_report_evidence') is null
     or to_regclass('public.push_notification_dedupe') is null then
    raise exception
      'Apply Drizzle 0021_general_posts.sql before this RLS migration.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'community_posts'
      and column_name = 'kind'
  ) then
    raise exception
      'Apply Drizzle 0021_general_posts.sql including community_posts.kind before this RLS migration.';
  end if;

  if to_regprocedure('private.community_post_visible_to(uuid, uuid)') is null
     or to_regprocedure('private.crew_content_visible(uuid, uuid, timestamptz)') is null
     or to_regprocedure('private.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('private.owns_workout_session(uuid)') is null
     or to_regprocedure('private.owns_photo_path(text)') is null then
    raise exception
      'Visibility helpers are required. Apply 20261111000000_workout_read_visibility.sql first.';
  end if;
end $$;

do $$
declare app_table text;
begin
  foreach app_table in array array[
    'general_publications','general_publication_photos','general_publication_links',
    'general_publication_upload_reservations','crew_pinned_posts',
    'content_report_evidence','push_notification_dedupe'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', app_table);
    execute pg_catalog.format('alter table public.%I force row level security', app_table);
  end loop;
end $$;

create or replace function private.community_post_visible_to(viewer_id uuid, target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_id is not null and target_post_id is not null and exists (
    select 1
    from public.community_posts as post
    join public.groups as crew on crew.id = post.group_id
    join public.group_members as viewer
      on viewer.group_id = post.group_id and viewer.user_id = viewer_id
    where post.id = target_post_id
      and post.removed_at is null
      and crew.closed_at is null
      and viewer.left_at is null
      and private.crew_content_visible(post.group_id, post.user_id, post.created_at)
      and not private.is_blocked_between(viewer_id, post.user_id)
      and not exists (
        select 1 from public.content_reports as report
        where report.reporter_id = viewer_id
          and report.target_type = 'post' and report.target_id = post.id
      )
      and (
        (
          post.kind = 'workout'
          and post.workout_session_id is not null
          and exists (
            select 1
            from public.workout_sessions as session
            where session.id = post.workout_session_id
              and session.user_id = post.user_id
          )
        )
        or (
          post.kind = 'general'
          and post.publication_id is not null
          and exists (
            select 1
            from public.general_publications as publication
            where publication.id = post.publication_id
              and publication.author_id = post.user_id
          )
        )
      )
  );
$$;

create or replace function private.can_access_community_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_post_visible_to(auth.uid(), target_post_id);
$$;

create or replace function private.general_publication_visible_to(
  viewer_id uuid,
  target_publication_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_id is not null and target_publication_id is not null and exists (
    select 1
    from public.community_posts as post
    where post.publication_id = target_publication_id
      and post.kind = 'general'
      and private.community_post_visible_to(viewer_id, post.id)
  );
$$;

create or replace function private.can_access_general_publication(target_publication_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and target_publication_id is not null
    and (
      exists (
        select 1
        from public.general_publications as publication
        where publication.id = target_publication_id
          and publication.author_id = auth.uid()
      )
      or private.general_publication_visible_to(auth.uid(), target_publication_id)
    );
$$;

create or replace function private.cleanup_expired_report_evidence()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.content_report_evidence as evidence
  where evidence.retain_until is not null
    and evidence.retain_until < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.community_post_visible_to(uuid, uuid) from public, anon, authenticated;
revoke all on function private.community_comment_visible_to(uuid, uuid) from public, anon, authenticated;
revoke all on function private.community_reaction_visible_to(uuid, uuid) from public, anon, authenticated;
revoke all on function private.general_publication_visible_to(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_access_community_post(uuid) from public, anon, authenticated;
revoke all on function private.can_access_general_publication(uuid) from public, anon, authenticated;
revoke all on function private.cleanup_expired_report_evidence() from public, anon, authenticated;
grant execute on function private.can_access_community_post(uuid) to authenticated;
grant execute on function private.can_access_general_publication(uuid) to authenticated;

do $api_grants$
declare
  api_role_name text := coalesce(nullif(current_setting('repin.visibility_api_role', true), ''), current_user);
begin
  execute pg_catalog.format('grant usage on schema private to %I', api_role_name);
  execute pg_catalog.format(
    'grant execute on function private.community_post_visible_to(uuid,uuid) to %I',
    api_role_name
  );
  execute pg_catalog.format(
    'grant execute on function private.community_comment_visible_to(uuid,uuid) to %I',
    api_role_name
  );
  execute pg_catalog.format(
    'grant execute on function private.community_reaction_visible_to(uuid,uuid) to %I',
    api_role_name
  );
  execute pg_catalog.format(
    'grant execute on function private.general_publication_visible_to(uuid,uuid) to %I',
    api_role_name
  );
  execute pg_catalog.format(
    'grant execute on function private.cleanup_expired_report_evidence() to %I',
    api_role_name
  );
end $api_grants$;

drop policy if exists community_posts_select_member on public.community_posts;
create policy community_posts_select_member
on public.community_posts
for select
to authenticated
using (user_id = auth.uid() or private.can_access_community_post(id));

drop policy if exists community_posts_insert_own on public.community_posts;
create policy community_posts_insert_own
on public.community_posts
for insert
to authenticated
with check (
  user_id = auth.uid()
  and kind = 'workout'
  and publication_id is null
  and workout_session_id is not null
  and private.is_group_member(group_id)
  and private.owns_workout_session(workout_session_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists community_posts_update_own on public.community_posts;
create policy community_posts_update_own
on public.community_posts
for update
to authenticated
using (user_id = auth.uid() and kind = 'workout')
with check (
  user_id = auth.uid()
  and kind = 'workout'
  and publication_id is null
  and workout_session_id is not null
  and private.is_group_member(group_id)
  and private.owns_workout_session(workout_session_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_delete_own
on public.community_posts
for delete
to authenticated
using (user_id = auth.uid() and kind = 'workout');

revoke all on table public.general_publications from public, anon, authenticated;
revoke all on table public.general_publication_photos from public, anon, authenticated;
revoke all on table public.general_publication_links from public, anon, authenticated;
revoke all on table public.general_publication_upload_reservations from public, anon, authenticated;
revoke all on table public.crew_pinned_posts from public, anon, authenticated;
revoke all on table public.content_report_evidence from public, anon, authenticated;
revoke all on table public.push_notification_dedupe from public, anon, authenticated;

grant select on table public.general_publications to authenticated;
grant select on table public.general_publication_photos to authenticated;
grant select on table public.general_publication_links to authenticated;
grant select on table public.general_publication_upload_reservations to authenticated;
grant select on table public.crew_pinned_posts to authenticated;

drop policy if exists general_publications_select_visible on public.general_publications;
create policy general_publications_select_visible
on public.general_publications
for select
to authenticated
using (private.can_access_general_publication(id));

drop policy if exists general_publication_photos_select_visible on public.general_publication_photos;
create policy general_publication_photos_select_visible
on public.general_publication_photos
for select
to authenticated
using (private.can_access_general_publication(publication_id));

drop policy if exists general_publication_links_select_visible on public.general_publication_links;
create policy general_publication_links_select_visible
on public.general_publication_links
for select
to authenticated
using (private.can_access_general_publication(publication_id));

drop policy if exists general_publication_upload_reservations_select_own
  on public.general_publication_upload_reservations;
create policy general_publication_upload_reservations_select_own
on public.general_publication_upload_reservations
for select
to authenticated
using (author_id = auth.uid());

drop policy if exists crew_pinned_posts_select_member on public.crew_pinned_posts;
create policy crew_pinned_posts_select_member
on public.crew_pinned_posts
for select
to authenticated
using (private.is_group_member(group_id));

drop policy if exists general_publications_insert_own on public.general_publications;
drop policy if exists general_publications_update_own on public.general_publications;
drop policy if exists general_publications_delete_own on public.general_publications;
drop policy if exists general_publication_photos_insert_own on public.general_publication_photos;
drop policy if exists general_publication_photos_update_own on public.general_publication_photos;
drop policy if exists general_publication_photos_delete_own on public.general_publication_photos;
drop policy if exists general_publication_links_insert_own on public.general_publication_links;
drop policy if exists general_publication_links_update_own on public.general_publication_links;
drop policy if exists general_publication_links_delete_own on public.general_publication_links;
drop policy if exists general_publication_upload_reservations_insert_own
  on public.general_publication_upload_reservations;
drop policy if exists general_publication_upload_reservations_update_own
  on public.general_publication_upload_reservations;
drop policy if exists general_publication_upload_reservations_delete_own
  on public.general_publication_upload_reservations;
drop policy if exists crew_pinned_posts_insert_own on public.crew_pinned_posts;
drop policy if exists crew_pinned_posts_update_own on public.crew_pinned_posts;
drop policy if exists crew_pinned_posts_delete_own on public.crew_pinned_posts;
drop policy if exists content_report_evidence_select_own on public.content_report_evidence;
create policy content_report_evidence_select_own
on public.content_report_evidence
for select
to authenticated
using (false);

drop policy if exists push_notification_dedupe_select_own on public.push_notification_dedupe;
create policy push_notification_dedupe_select_own
on public.push_notification_dedupe
for select
to authenticated
using (false);
