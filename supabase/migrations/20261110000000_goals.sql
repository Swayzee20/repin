-- Goals, period ledger, and post Goal badges.
-- Apply after Drizzle 0019_ancient_wind_dancer.sql.
--
-- The API uses a role that bypasses RLS. These policies close direct
-- PostgREST access with the publishable key.
--
-- goals and goal_periods: owner SELECT only.
-- community_post_goals: owner and current crew members may SELECT badge
-- rows on posts in groups they currently belong to via
-- private.can_access_community_post. Block checks go through
-- private.is_blocked_between so both directions are visible under FORCE
-- RLS on user_blocks (blocker-only SELECT).
--
-- Writes stay on DATABASE_URL. authenticated is granted SELECT only; there
-- are no insert/update/delete policies, so a client cannot forge a badge.

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

  if to_regclass('public.goals') is null
     or to_regclass('public.goal_periods') is null
     or to_regclass('public.community_post_goals') is null then
    raise exception
      'Apply Drizzle 0019_ancient_wind_dancer.sql before this RLS migration.';
  end if;

  if to_regprocedure('private.can_access_community_post(uuid)') is null
     or to_regprocedure('private.is_group_member(uuid)') is null
     or to_regprocedure('private.crew_content_visible(uuid, uuid, timestamptz)') is null
     or to_regprocedure('private.is_blocked_between(uuid, uuid)') is null then
    raise exception
      'Crew visibility helpers are required. Apply 20261106000000_crew_page.sql and 20261109000000_personal_records.sql first.';
  end if;
end $$;

alter table public.goals enable row level security;
alter table public.goals force row level security;
alter table public.goal_periods enable row level security;
alter table public.goal_periods force row level security;
alter table public.community_post_goals enable row level security;
alter table public.community_post_goals force row level security;

revoke all on table public.goals from public, anon, authenticated;
revoke all on table public.goal_periods from public, anon, authenticated;
revoke all on table public.community_post_goals from public, anon, authenticated;

grant select on table public.goals to authenticated;
grant select on table public.goal_periods to authenticated;
grant select on table public.community_post_goals to authenticated;

drop policy if exists goals_select_own on public.goals;
create policy goals_select_own
on public.goals
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists goal_periods_select_own on public.goal_periods;
create policy goal_periods_select_own
on public.goal_periods
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists community_post_goals_select_member on public.community_post_goals;
create policy community_post_goals_select_member
on public.community_post_goals
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    private.can_access_community_post(post_id)
    and exists (
      select 1
      from public.community_posts as post
      where post.id = community_post_goals.post_id
        and post.removed_at is null
    )
    and not private.is_blocked_between(auth.uid(), community_post_goals.user_id)
  )
);

drop policy if exists goals_insert_own on public.goals;
drop policy if exists goals_update_own on public.goals;
drop policy if exists goals_delete_own on public.goals;
drop policy if exists goal_periods_insert_own on public.goal_periods;
drop policy if exists goal_periods_update_own on public.goal_periods;
drop policy if exists goal_periods_delete_own on public.goal_periods;
drop policy if exists community_post_goals_insert_own on public.community_post_goals;
drop policy if exists community_post_goals_update_own on public.community_post_goals;
drop policy if exists community_post_goals_delete_own on public.community_post_goals;
