-- Crew page: photo, close, leave/rejoin watermark, notification prefs, and
-- storage for crew-photos. Apply after Drizzle 0016_modern_layla_miller.sql.
--
-- The API uses a role that bypasses RLS. These policies close direct
-- PostgREST access with the publishable key. Invite-only: non-members cannot
-- discover groups, codes, or rosters. Active membership is left_at is null.

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
end $$;

create or replace function private.is_group_member(target_group_id uuid)
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
        and left_at is null
    );
$$;

create or replace function private.shares_group(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.group_members as mine
      join public.group_members as peer
        on peer.group_id = mine.group_id
      where mine.user_id = auth.uid()
        and peer.user_id = target_user_id
        and mine.left_at is null
        and peer.left_at is null
    );
$$;

create or replace function private.crew_content_visible(
  target_group_id uuid,
  author_id uuid,
  content_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members as membership
    where membership.group_id = target_group_id
      and membership.user_id = author_id
      and membership.left_at is null
      and content_created_at >= membership.content_visible_after
  );
$$;

create or replace function private.can_access_community_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_posts as post
    where post.id = target_post_id
      and private.is_group_member(post.group_id)
      and private.crew_content_visible(post.group_id, post.user_id, post.created_at)
  );
$$;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'is_group_member',
        'shares_group',
        'crew_content_visible',
        'can_access_community_post'
      )
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

drop policy if exists group_members_select_roster on public.group_members;
create policy group_members_select_roster
on public.group_members
for select
to authenticated
using (
  left_at is null
  and (
    user_id = auth.uid()
    or private.is_group_member(group_id)
  )
);

drop policy if exists community_posts_select_member on public.community_posts;
create policy community_posts_select_member
on public.community_posts
for select
to authenticated
using (
  private.is_group_member(group_id)
  and private.crew_content_visible(group_id, user_id, created_at)
);

drop policy if exists community_post_comments_select_member on public.community_post_comments;
create policy community_post_comments_select_member
on public.community_post_comments
for select
to authenticated
using (
  private.can_access_community_post(community_post_id)
  and exists (
    select 1
    from public.community_posts as post
    where post.id = community_post_id
      and private.crew_content_visible(
        post.group_id,
        community_post_comments.user_id,
        community_post_comments.created_at
      )
  )
);

drop policy if exists community_post_reactions_select_member on public.community_post_reactions;
create policy community_post_reactions_select_member
on public.community_post_reactions
for select
to authenticated
using (
  private.can_access_community_post(community_post_id)
  and exists (
    select 1
    from public.community_posts as post
    where post.id = community_post_id
      and private.crew_content_visible(
        post.group_id,
        community_post_reactions.user_id,
        community_post_reactions.created_at
      )
  )
);

alter table public.crew_notification_prefs enable row level security;
alter table public.crew_notification_prefs force row level security;
revoke all on table public.crew_notification_prefs from public, anon, authenticated;
grant select, insert, update, delete on table public.crew_notification_prefs to authenticated;

drop policy if exists crew_notification_prefs_select_own on public.crew_notification_prefs;
create policy crew_notification_prefs_select_own
on public.crew_notification_prefs
for select
to authenticated
using (
  user_id = auth.uid()
  and private.is_group_member(group_id)
);

drop policy if exists crew_notification_prefs_insert_own on public.crew_notification_prefs;
create policy crew_notification_prefs_insert_own
on public.crew_notification_prefs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
);

drop policy if exists crew_notification_prefs_update_own on public.crew_notification_prefs;
create policy crew_notification_prefs_update_own
on public.crew_notification_prefs
for update
to authenticated
using (
  user_id = auth.uid()
  and private.is_group_member(group_id)
)
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
);

drop policy if exists crew_notification_prefs_delete_own on public.crew_notification_prefs;
create policy crew_notification_prefs_delete_own
on public.crew_notification_prefs
for delete
to authenticated
using (
  user_id = auth.uid()
  and private.is_group_member(group_id)
);

create or replace function public.join_group_by_invite_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  target_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  normalized := upper(btrim(coalesce(invite_code, '')));
  if normalized !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    return null;
  end if;

  select id
  into target_group_id
  from public.groups
  where groups.invite_code = normalized
    and groups.closed_at is null;

  if target_group_id is null then
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do update
  set
    left_at = null,
    joined_at = now(),
    content_visible_after = now(),
    role = 'member'
  where public.group_members.left_at is not null;

  return target_group_id;
end;
$$;

revoke all on function public.join_group_by_invite_code(text) from public, anon;
grant execute on function public.join_group_by_invite_code(text) to authenticated;

-- Storage: crew-photos/{groupId}/… Owner uploads; the API signs reads after
-- it has checked membership. Group members do not get a direct object read.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  if to_regclass('storage.buckets') is not null then
    begin
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'crew-photos',
        'crew-photos',
        false,
        10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
      )
      on conflict (id) do update set
        public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
    exception
      when insufficient_privilege then
        raise notice 'Could not upsert storage.buckets (insufficient privilege). Create the crew-photos bucket from the Supabase dashboard (Storage) as private, 10 MB, image/jpeg|png|webp|heic|heif.';
    end;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Crew photo owners can read'
  ) then
    begin
      create policy "Crew photo owners can read"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'crew-photos'
        and exists (
          select 1
          from public.groups
          where groups.id::text = (storage.foldername(name))[1]
            and groups.owner_id = auth.uid()
        )
      );
    exception
      when insufficient_privilege then
        raise notice 'Could not create policy "Crew photo owners can read" on storage.objects (insufficient privilege). Create that policy from the Supabase dashboard (Storage > Policies).';
    end;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Crew photo owners can upload'
  ) then
    begin
      create policy "Crew photo owners can upload"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'crew-photos'
        and exists (
          select 1
          from public.groups
          where groups.id::text = (storage.foldername(name))[1]
            and groups.owner_id = auth.uid()
        )
      );
    exception
      when insufficient_privilege then
        raise notice 'Could not create policy "Crew photo owners can upload" on storage.objects (insufficient privilege). Create that policy from the Supabase dashboard (Storage > Policies).';
    end;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Crew photo owners can update'
  ) then
    begin
      create policy "Crew photo owners can update"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'crew-photos'
        and exists (
          select 1
          from public.groups
          where groups.id::text = (storage.foldername(name))[1]
            and groups.owner_id = auth.uid()
        )
      )
      with check (
        bucket_id = 'crew-photos'
        and exists (
          select 1
          from public.groups
          where groups.id::text = (storage.foldername(name))[1]
            and groups.owner_id = auth.uid()
        )
      );
    exception
      when insufficient_privilege then
        raise notice 'Could not create policy "Crew photo owners can update" on storage.objects (insufficient privilege). Create that policy from the Supabase dashboard (Storage > Policies).';
    end;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Crew photo owners can delete'
  ) then
    begin
      create policy "Crew photo owners can delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'crew-photos'
        and exists (
          select 1
          from public.groups
          where groups.id::text = (storage.foldername(name))[1]
            and groups.owner_id = auth.uid()
        )
      );
    exception
      when insufficient_privilege then
        raise notice 'Could not create policy "Crew photo owners can delete" on storage.objects (insufficient privilege). Create that policy from the Supabase dashboard (Storage > Policies).';
    end;
  end if;
end $$;
