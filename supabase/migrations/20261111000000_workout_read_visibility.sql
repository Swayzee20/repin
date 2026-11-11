begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Insert verified API-role override here, if needed, before the preflight.
do $preflight$
declare
  app_table text;
  fn text;
  expected record;
  api_role_name text := coalesce(nullif(current_setting('repin.visibility_api_role',true),''),current_user);
  api_oid oid;
begin
  if to_regprocedure('auth.uid()') is null
    or not exists(select 1 from pg_catalog.pg_roles where rolname='anon')
    or not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then
    raise exception 'Supabase auth.uid and roles required';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Applying owner must already bypass FORCE RLS; do not add BYPASSRLS';
  end if;
  select oid into api_oid from pg_catalog.pg_roles
    where rolname=api_role_name and (rolsuper or rolbypassrls);
  if api_oid is null or api_role_name in ('anon','authenticated') then
    raise exception 'Verify existing privileged DATABASE_URL role';
  end if;
  if pg_catalog.pg_has_role('authenticated',api_oid,'MEMBER')
    or pg_catalog.pg_has_role('anon',api_oid,'MEMBER') then
    raise exception 'Client must not inherit/assume API role';
  end if;
  foreach app_table in array array[
    'workouts','movements','workout_definitions','workout_blocks','block_movements',
    'workout_sessions','workout_session_metrics','workout_session_segments',
    'session_movement_results','set_results','community_posts','community_post_comments',
    'community_post_reactions','personal_records','community_post_prs','goals',
    'goal_periods','community_post_goals','groups','group_members','users','user_blocks','content_reports'
  ] loop
    if to_regclass('public.'||app_table) is null then
      raise exception 'Missing prerequisite table %',app_table;
    end if;
    if (select count(*) from pg_catalog.pg_policy
        where polrelid=to_regclass('public.'||app_table) and polcmd in ('r','*')) <> 1 then
      raise exception 'Unexpected SELECT/ALL policy set on %; inspect first',app_table;
    end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.goals'::regclass and attname='archived_at' and not attisdropped)
    or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.goal_periods'::regclass and attname='archive_cutoff_at' and not attisdropped) then
    raise exception 'Complete Goals 0019 required';
  end if;
  foreach fn in array array[
    'private.owns_workout_session(uuid)','private.can_read_workout_session(uuid)',
    'private.owns_workout_definition(uuid)','private.can_read_workout_definition(uuid)',
    'private.owns_workout_block(uuid)','private.can_read_workout_block(uuid)',
    'private.owns_session_movement(uuid)','private.can_read_session_movement(uuid)',
    'private.is_group_member(uuid)','private.shares_group(uuid)',
    'private.can_access_community_post(uuid)',
    'private.crew_content_visible(uuid,uuid,timestamptz)',
    'private.is_blocked_between(uuid,uuid)','private.goal_badge_post_visible(uuid)'
  ] loop
    if to_regprocedure(fn) is null then raise exception 'Missing helper %',fn; end if;
    if exists(select 1 from pg_catalog.pg_proc as p
      join pg_catalog.pg_roles as owner on owner.oid=p.proowner
      where p.oid=to_regprocedure(fn) and
        (not p.prosecdef or p.provolatile<>'s' or not(owner.rolsuper or owner.rolbypassrls)
        or not(coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']))) then
      raise exception 'Unsafe helper owner/attributes %',fn;
    end if;
  end loop;
  foreach fn in array array[
    'private.can_access_community_post(uuid)','private.can_read_workout_session(uuid)',
    'private.can_read_workout_definition(uuid)',
    'private.community_post_visible_to(uuid,uuid)','private.community_comment_visible_to(uuid,uuid)',
    'private.community_reaction_visible_to(uuid,uuid)',
    'private.can_read_community_comment(uuid)','private.can_read_community_reaction(uuid)'
  ] loop
    if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(fn)
      and proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)) then
      raise exception 'Unexpected owner for %; inspect rather than transferring ownership',fn;
    end if;
  end loop;
  for expected in select * from (values
    ('workouts','workouts_select_own_or_group'),
    ('community_posts','community_posts_select_member'),
    ('community_post_comments','community_post_comments_select_member'),
    ('community_post_reactions','community_post_reactions_select_member'),
    ('community_post_prs','community_post_prs_select_member')
  ) as x(table_name,policy_name) loop
    if not exists(select 1 from pg_catalog.pg_policy
      where polrelid=to_regclass('public.'||expected.table_name)
      and polname=expected.policy_name and polcmd='r') then
      raise exception 'Unexpected policy name on %',expected.table_name;
    end if;
  end loop;
end $preflight$;

do $$
declare app_table text;
begin
  foreach app_table in array array[
    'workouts','movements','workout_definitions','workout_blocks','block_movements',
    'workout_sessions','workout_session_metrics','workout_session_segments',
    'session_movement_results','set_results','community_posts','community_post_comments',
    'community_post_reactions','personal_records','community_post_prs','goals',
    'goal_periods','community_post_goals','groups','group_members','users','user_blocks','content_reports'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security',app_table);
    execute pg_catalog.format('alter table public.%I force row level security',app_table);
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
    join public.workout_sessions as session
      on session.id = post.workout_session_id and session.user_id = post.user_id
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

create or replace function private.can_read_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_session_id is not null and auth.uid() is not null and (
    private.owns_workout_session(target_session_id)
    or exists (
      select 1 from public.community_posts as post
      where post.workout_session_id = target_session_id
        and private.can_access_community_post(post.id)
    )
  );
$$;

create or replace function private.can_read_workout_definition(target_definition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_definition_id is not null and auth.uid() is not null and (
    private.owns_workout_definition(target_definition_id)
    or exists (
      select 1 from public.workout_sessions as session
      join public.workout_definitions as definition
        on definition.id = session.workout_definition_id
      where definition.id = target_definition_id
        and session.user_id = definition.created_by_user_id
        and private.can_read_workout_session(session.id)
    )
  );
$$;

create or replace function private.community_comment_visible_to(viewer_id uuid, target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_id is not null and target_comment_id is not null and exists (
    select 1 from public.community_post_comments as comment
    join public.community_posts as post on post.id = comment.community_post_id
    where comment.id = target_comment_id
      and private.community_post_visible_to(viewer_id, post.id)
      and comment.removed_at is null
      and private.crew_content_visible(post.group_id, comment.user_id, comment.created_at)
      and not private.is_blocked_between(viewer_id, comment.user_id)
      and not exists (
        select 1 from public.content_reports as report
        where report.reporter_id = viewer_id
          and report.target_type = 'comment' and report.target_id = comment.id
      )
  );
$$;

create or replace function private.community_reaction_visible_to(viewer_id uuid, target_reaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_id is not null and target_reaction_id is not null and exists (
    select 1 from public.community_post_reactions as reaction
    join public.community_posts as post on post.id = reaction.community_post_id
    where reaction.id = target_reaction_id
      and private.community_post_visible_to(viewer_id, post.id)
      and private.crew_content_visible(post.group_id, reaction.user_id, reaction.created_at)
      and not private.is_blocked_between(viewer_id, reaction.user_id)
  );
$$;

create or replace function private.can_read_community_comment(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and target_comment_id is not null and exists (
    select 1 from public.community_post_comments as comment
    where comment.id = target_comment_id and (
      comment.user_id = auth.uid()
      or private.community_comment_visible_to(auth.uid(), comment.id)
    )
  );
$$;

create or replace function private.can_read_community_reaction(target_reaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and target_reaction_id is not null and exists (
    select 1 from public.community_post_reactions as reaction
    where reaction.id = target_reaction_id and (
      reaction.user_id = auth.uid()
      or private.community_reaction_visible_to(auth.uid(), reaction.id)
    )
  );
$$;

drop policy if exists workouts_select_own_or_group on public.workouts;
create policy workouts_select_own_or_group
on public.workouts
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.community_posts as post
    where post.workout_session_id = workouts.id
      and post.group_id = workouts.group_id
      and post.user_id = workouts.user_id
      and private.can_access_community_post(post.id)
  )
);

drop policy if exists community_posts_select_member on public.community_posts;
create policy community_posts_select_member
on public.community_posts
for select
to authenticated
using (user_id = auth.uid() or private.can_access_community_post(id));

drop policy if exists community_post_comments_select_member on public.community_post_comments;
create policy community_post_comments_select_member
on public.community_post_comments
for select
to authenticated
using (private.can_read_community_comment(id));

drop policy if exists community_post_reactions_select_member on public.community_post_reactions;
create policy community_post_reactions_select_member
on public.community_post_reactions
for select
to authenticated
using (private.can_read_community_reaction(id));

drop policy if exists community_post_prs_select_member on public.community_post_prs;
create policy community_post_prs_select_member
on public.community_post_prs
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    private.can_access_community_post(post_id)
    and not private.is_blocked_between(auth.uid(), user_id)
  )
);

revoke all on function private.community_post_visible_to(uuid,uuid) from public, anon, authenticated;
revoke all on function private.community_comment_visible_to(uuid,uuid) from public, anon, authenticated;
revoke all on function private.community_reaction_visible_to(uuid,uuid) from public, anon, authenticated;
revoke all on function private.can_access_community_post(uuid) from public, anon, authenticated;
revoke all on function private.can_read_workout_session(uuid) from public, anon, authenticated;
revoke all on function private.can_read_workout_definition(uuid) from public, anon, authenticated;
revoke all on function private.can_read_community_comment(uuid) from public, anon, authenticated;
revoke all on function private.can_read_community_reaction(uuid) from public, anon, authenticated;
grant execute on function private.can_access_community_post(uuid) to authenticated;
grant execute on function private.can_read_workout_session(uuid) to authenticated;
grant execute on function private.can_read_workout_definition(uuid) to authenticated;
grant execute on function private.can_read_community_comment(uuid) to authenticated;
grant execute on function private.can_read_community_reaction(uuid) to authenticated;

do $api_grants$
declare
  api_role_name text := coalesce(nullif(current_setting('repin.visibility_api_role',true),''),current_user);
begin
  execute pg_catalog.format('grant usage on schema private to %I',api_role_name);
  execute pg_catalog.format('grant execute on function private.community_post_visible_to(uuid,uuid) to %I',api_role_name);
  execute pg_catalog.format('grant execute on function private.community_comment_visible_to(uuid,uuid) to %I',api_role_name);
  execute pg_catalog.format('grant execute on function private.community_reaction_visible_to(uuid,uuid) to %I',api_role_name);
end $api_grants$;

revoke all on table public.personal_records from public, anon, authenticated;
revoke all on table public.community_post_prs from public, anon, authenticated;
revoke all on table public.goals from public, anon, authenticated;
revoke all on table public.goal_periods from public, anon, authenticated;
revoke all on table public.community_post_goals from public, anon, authenticated;
grant select on table public.personal_records to authenticated;
grant select on table public.community_post_prs to authenticated;
grant select on table public.goals to authenticated;
grant select on table public.goal_periods to authenticated;
grant select on table public.community_post_goals to authenticated;
commit;
