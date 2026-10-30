-- Row level security for every public application table.
--
-- The Next.js API connects with DATABASE_URL as a role that bypasses RLS
-- (Supabase's postgres role, or a local superuser). It remains the path for
-- signup provisioning, group creation, invite lookup, and the community board.
-- The publishable key in the Expo client is only used for Auth and for
-- uploading a workout photo into the signed-in user's own storage folder.
-- These policies close direct PostgREST and Realtime access with that key.
--
-- anon receives no table privileges and no policies. Nothing before login
-- reads these tables: Auth goes through GoTrue, and the public invite page
-- is rendered by the API with the bypass role after it already has the code.
--
-- authenticated may read a shared group, its members, and the content posted
-- there, plus their own rows. Writes are limited to rows they own. Group
-- membership cannot be inserted directly; join_group_by_invite_code() is the
-- only client-callable write, and it inserts the caller as a member only when
-- the invite code matches. Movements are the exception: a shared exercise
-- catalog with no owner, readable by any signed-in user and not writable here.

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

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

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
    );
$$;

create or replace function private.owns_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions as session
    where session.id = target_session_id
      and session.user_id = auth.uid()
  );
$$;

create or replace function private.can_read_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_session_id is not null
    and auth.uid() is not null
    and (
      private.owns_workout_session(target_session_id)
      or exists (
        select 1
        from public.community_posts as post
        where post.workout_session_id = target_session_id
          and private.is_group_member(post.group_id)
      )
    );
$$;

create or replace function private.owns_workout_definition(target_definition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_definitions as definition
    where definition.id = target_definition_id
      and definition.created_by_user_id = auth.uid()
  );
$$;

create or replace function private.can_read_workout_definition(target_definition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_definition_id is not null
    and auth.uid() is not null
    and (
      private.owns_workout_definition(target_definition_id)
      or exists (
        select 1
        from public.workout_sessions as session
        where session.workout_definition_id = target_definition_id
          and private.can_read_workout_session(session.id)
      )
    );
$$;

create or replace function private.owns_workout_block(target_block_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_blocks as block
    join public.workout_definitions as definition
      on definition.id = block.workout_definition_id
    where block.id = target_block_id
      and definition.created_by_user_id = auth.uid()
  );
$$;

create or replace function private.can_read_workout_block(target_block_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_blocks as block
    where block.id = target_block_id
      and private.can_read_workout_definition(block.workout_definition_id)
  );
$$;

create or replace function private.owns_session_movement(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_movement_results as result
    join public.workout_sessions as session
      on session.id = result.workout_session_id
    where result.id = target_result_id
      and session.user_id = auth.uid()
  );
$$;

create or replace function private.can_read_session_movement(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_movement_results as result
    where result.id = target_result_id
      and private.can_read_workout_session(result.workout_session_id)
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
  );
$$;

-- Invoker function: it only compares the path prefix to the caller.
create or replace function private.owns_photo_path(target_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    target_path is null
    or (
      auth.uid() is not null
      and target_path like (auth.uid()::text || '/%')
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
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

do $$
declare
  app_table text;
begin
  foreach app_table in array array[
    'users',
    'groups',
    'group_members',
    'workouts',
    'movements',
    'workout_definitions',
    'workout_blocks',
    'block_movements',
    'workout_sessions',
    'workout_session_metrics',
    'workout_session_segments',
    'session_movement_results',
    'set_results',
    'community_posts',
    'community_post_reactions',
    'community_post_comments'
  ]
  loop
    execute format('alter table public.%I enable row level security', app_table);
    execute format('alter table public.%I force row level security', app_table);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      app_table
    );
  end loop;
end $$;

grant select on table
  public.users,
  public.groups,
  public.group_members,
  public.movements
to authenticated;

grant select, insert, update, delete on table
  public.workouts,
  public.workout_definitions,
  public.workout_blocks,
  public.block_movements,
  public.workout_sessions,
  public.workout_session_metrics,
  public.workout_session_segments,
  public.session_movement_results,
  public.set_results,
  public.community_posts,
  public.community_post_reactions,
  public.community_post_comments
to authenticated;

-- users: self, plus display names of people who share a group.
drop policy if exists users_select_self_or_group_peer on public.users;
create policy users_select_self_or_group_peer
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or private.shares_group(id)
);

-- groups: members can read the row, including the invite code they already share.
-- Non-members cannot discover ids or codes. No client insert/update/delete.
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member
on public.groups
for select
to authenticated
using (private.is_group_member(id));

-- group_members: see your own memberships and the roster of those groups.
-- Inserts are not granted. Join goes through join_group_by_invite_code().
drop policy if exists group_members_select_roster on public.group_members;
create policy group_members_select_roster
on public.group_members
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_group_member(group_id)
);

-- movements: shared catalog. Signed-in users can read it. They cannot write it.
drop policy if exists movements_select_catalog on public.movements;
create policy movements_select_catalog
on public.movements
for select
to authenticated
using (true);

-- Legacy workouts table. Still present and exposed by PostgREST.
drop policy if exists workouts_select_own_or_group on public.workouts;
create policy workouts_select_own_or_group
on public.workouts
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_group_member(group_id)
);

drop policy if exists workouts_insert_own on public.workouts;
create policy workouts_insert_own
on public.workouts
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists workouts_update_own on public.workouts;
create policy workouts_update_own
on public.workouts
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists workouts_delete_own on public.workouts;
create policy workouts_delete_own
on public.workouts
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists workout_definitions_select_visible on public.workout_definitions;
create policy workout_definitions_select_visible
on public.workout_definitions
for select
to authenticated
using (private.can_read_workout_definition(id));

drop policy if exists workout_definitions_insert_own on public.workout_definitions;
create policy workout_definitions_insert_own
on public.workout_definitions
for insert
to authenticated
with check (created_by_user_id = auth.uid());

drop policy if exists workout_definitions_update_own on public.workout_definitions;
create policy workout_definitions_update_own
on public.workout_definitions
for update
to authenticated
using (created_by_user_id = auth.uid())
with check (created_by_user_id = auth.uid());

drop policy if exists workout_definitions_delete_own on public.workout_definitions;
create policy workout_definitions_delete_own
on public.workout_definitions
for delete
to authenticated
using (created_by_user_id = auth.uid());

drop policy if exists workout_blocks_select_visible on public.workout_blocks;
create policy workout_blocks_select_visible
on public.workout_blocks
for select
to authenticated
using (private.can_read_workout_definition(workout_definition_id));

drop policy if exists workout_blocks_insert_own on public.workout_blocks;
create policy workout_blocks_insert_own
on public.workout_blocks
for insert
to authenticated
with check (private.owns_workout_definition(workout_definition_id));

drop policy if exists workout_blocks_update_own on public.workout_blocks;
create policy workout_blocks_update_own
on public.workout_blocks
for update
to authenticated
using (private.owns_workout_definition(workout_definition_id))
with check (private.owns_workout_definition(workout_definition_id));

drop policy if exists workout_blocks_delete_own on public.workout_blocks;
create policy workout_blocks_delete_own
on public.workout_blocks
for delete
to authenticated
using (private.owns_workout_definition(workout_definition_id));

drop policy if exists block_movements_select_visible on public.block_movements;
create policy block_movements_select_visible
on public.block_movements
for select
to authenticated
using (private.can_read_workout_block(workout_block_id));

drop policy if exists block_movements_insert_own on public.block_movements;
create policy block_movements_insert_own
on public.block_movements
for insert
to authenticated
with check (private.owns_workout_block(workout_block_id));

drop policy if exists block_movements_update_own on public.block_movements;
create policy block_movements_update_own
on public.block_movements
for update
to authenticated
using (private.owns_workout_block(workout_block_id))
with check (private.owns_workout_block(workout_block_id));

drop policy if exists block_movements_delete_own on public.block_movements;
create policy block_movements_delete_own
on public.block_movements
for delete
to authenticated
using (private.owns_workout_block(workout_block_id));

drop policy if exists workout_sessions_select_visible on public.workout_sessions;
create policy workout_sessions_select_visible
on public.workout_sessions
for select
to authenticated
using (private.can_read_workout_session(id));

drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own
on public.workout_sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own
on public.workout_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists workout_sessions_delete_own on public.workout_sessions;
create policy workout_sessions_delete_own
on public.workout_sessions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists workout_session_metrics_select_visible on public.workout_session_metrics;
create policy workout_session_metrics_select_visible
on public.workout_session_metrics
for select
to authenticated
using (private.can_read_workout_session(workout_session_id));

drop policy if exists workout_session_metrics_insert_own on public.workout_session_metrics;
create policy workout_session_metrics_insert_own
on public.workout_session_metrics
for insert
to authenticated
with check (private.owns_workout_session(workout_session_id));

drop policy if exists workout_session_metrics_update_own on public.workout_session_metrics;
create policy workout_session_metrics_update_own
on public.workout_session_metrics
for update
to authenticated
using (private.owns_workout_session(workout_session_id))
with check (private.owns_workout_session(workout_session_id));

drop policy if exists workout_session_metrics_delete_own on public.workout_session_metrics;
create policy workout_session_metrics_delete_own
on public.workout_session_metrics
for delete
to authenticated
using (private.owns_workout_session(workout_session_id));

drop policy if exists workout_session_segments_select_visible on public.workout_session_segments;
create policy workout_session_segments_select_visible
on public.workout_session_segments
for select
to authenticated
using (private.can_read_workout_session(workout_session_id));

drop policy if exists workout_session_segments_insert_own on public.workout_session_segments;
create policy workout_session_segments_insert_own
on public.workout_session_segments
for insert
to authenticated
with check (private.owns_workout_session(workout_session_id));

drop policy if exists workout_session_segments_update_own on public.workout_session_segments;
create policy workout_session_segments_update_own
on public.workout_session_segments
for update
to authenticated
using (private.owns_workout_session(workout_session_id))
with check (private.owns_workout_session(workout_session_id));

drop policy if exists workout_session_segments_delete_own on public.workout_session_segments;
create policy workout_session_segments_delete_own
on public.workout_session_segments
for delete
to authenticated
using (private.owns_workout_session(workout_session_id));

drop policy if exists session_movement_results_select_visible on public.session_movement_results;
create policy session_movement_results_select_visible
on public.session_movement_results
for select
to authenticated
using (private.can_read_workout_session(workout_session_id));

drop policy if exists session_movement_results_insert_own on public.session_movement_results;
create policy session_movement_results_insert_own
on public.session_movement_results
for insert
to authenticated
with check (private.owns_workout_session(workout_session_id));

drop policy if exists session_movement_results_update_own on public.session_movement_results;
create policy session_movement_results_update_own
on public.session_movement_results
for update
to authenticated
using (private.owns_workout_session(workout_session_id))
with check (private.owns_workout_session(workout_session_id));

drop policy if exists session_movement_results_delete_own on public.session_movement_results;
create policy session_movement_results_delete_own
on public.session_movement_results
for delete
to authenticated
using (private.owns_workout_session(workout_session_id));

drop policy if exists set_results_select_visible on public.set_results;
create policy set_results_select_visible
on public.set_results
for select
to authenticated
using (private.can_read_session_movement(session_movement_result_id));

drop policy if exists set_results_insert_own on public.set_results;
create policy set_results_insert_own
on public.set_results
for insert
to authenticated
with check (private.owns_session_movement(session_movement_result_id));

drop policy if exists set_results_update_own on public.set_results;
create policy set_results_update_own
on public.set_results
for update
to authenticated
using (private.owns_session_movement(session_movement_result_id))
with check (private.owns_session_movement(session_movement_result_id));

drop policy if exists set_results_delete_own on public.set_results;
create policy set_results_delete_own
on public.set_results
for delete
to authenticated
using (private.owns_session_movement(session_movement_result_id));

drop policy if exists community_posts_select_member on public.community_posts;
create policy community_posts_select_member
on public.community_posts
for select
to authenticated
using (private.is_group_member(group_id));

drop policy if exists community_posts_insert_own on public.community_posts;
create policy community_posts_insert_own
on public.community_posts
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
  and private.owns_workout_session(workout_session_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists community_posts_update_own on public.community_posts;
create policy community_posts_update_own
on public.community_posts
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and private.is_group_member(group_id)
  and private.owns_workout_session(workout_session_id)
  and private.owns_photo_path(photo_path)
);

drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_delete_own
on public.community_posts
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists community_post_reactions_select_member on public.community_post_reactions;
create policy community_post_reactions_select_member
on public.community_post_reactions
for select
to authenticated
using (private.can_access_community_post(community_post_id));

drop policy if exists community_post_reactions_insert_own on public.community_post_reactions;
create policy community_post_reactions_insert_own
on public.community_post_reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.can_access_community_post(community_post_id)
);

drop policy if exists community_post_reactions_update_own on public.community_post_reactions;
create policy community_post_reactions_update_own
on public.community_post_reactions
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and private.can_access_community_post(community_post_id)
);

drop policy if exists community_post_reactions_delete_own on public.community_post_reactions;
create policy community_post_reactions_delete_own
on public.community_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists community_post_comments_select_member on public.community_post_comments;
create policy community_post_comments_select_member
on public.community_post_comments
for select
to authenticated
using (private.can_access_community_post(community_post_id));

drop policy if exists community_post_comments_insert_own on public.community_post_comments;
create policy community_post_comments_insert_own
on public.community_post_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.can_access_community_post(community_post_id)
);

drop policy if exists community_post_comments_update_own on public.community_post_comments;
create policy community_post_comments_update_own
on public.community_post_comments
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and private.can_access_community_post(community_post_id)
);

drop policy if exists community_post_comments_delete_own on public.community_post_comments;
create policy community_post_comments_delete_own
on public.community_post_comments
for delete
to authenticated
using (user_id = auth.uid());

-- Direct-client join. The API does not call this; it checks the code itself
-- and writes through the bypass role. Authenticated users cannot insert
-- group_members any other way, so a known group id is not enough to join.
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
  where groups.invite_code = normalized;

  if target_group_id is null then
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return target_group_id;
end;
$$;

revoke all on function public.join_group_by_invite_code(text) from public, anon;
grant execute on function public.join_group_by_invite_code(text) to authenticated;

-- Storage. The bucket and owner-folder policies are created in
-- 20260822000000_workout_photos.sql. Repeat them only when missing so this
-- migration still enforces them, and keep the bucket private. Do not force
-- RLS on storage.objects: Supabase Storage's owner role relies on the
-- default owner bypass for service operations. User requests run as
-- authenticated, so the policies still apply. Group members do not get a
-- direct object read; the API signs photo URLs with the service role after
-- it has checked membership.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'alter table storage.objects enable row level security';

  if to_regclass('storage.buckets') is not null then
    update storage.buckets
    set public = false
    where id = 'workout-photos';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Workout photo owners can read'
  ) then
    create policy "Workout photo owners can read"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'workout-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Workout photo owners can upload'
  ) then
    create policy "Workout photo owners can upload"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'workout-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Workout photo owners can update'
  ) then
    create policy "Workout photo owners can update"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'workout-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'workout-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Workout photo owners can delete'
  ) then
    create policy "Workout photo owners can delete"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'workout-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;
