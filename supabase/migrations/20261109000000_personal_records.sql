-- Personal records and post PR badges.
-- Apply after Drizzle 0018_first_ultron.sql.
--
-- The API uses a role that bypasses RLS. These policies close direct
-- PostgREST access with the publishable key.
--
-- personal_records: owner SELECT only. Crew members cannot read unshared PRs.
-- community_post_prs: owner and current crew members may SELECT badge rows
-- on posts in groups they currently belong to via private.is_group_member
-- and private.crew_content_visible (private.can_access_community_post).
-- Block checks go through private.is_blocked_between so both directions
-- are visible under FORCE RLS on user_blocks (blocker-only SELECT).
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

  if to_regclass('public.personal_records') is null
     or to_regclass('public.community_post_prs') is null then
    raise exception
      'Apply Drizzle 0018_first_ultron.sql before this RLS migration.';
  end if;

  if to_regprocedure('private.can_access_community_post(uuid)') is null
     or to_regprocedure('private.is_group_member(uuid)') is null
     or to_regprocedure('private.crew_content_visible(uuid, uuid, timestamptz)') is null then
    raise exception
      'Crew visibility helpers are required. Apply 20261106000000_crew_page.sql first.';
  end if;
end $$;

create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    a is not null
    and b is not null
    and exists (
      select 1
      from public.user_blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
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
      and p.proname = 'is_blocked_between'
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

alter table public.personal_records enable row level security;
alter table public.personal_records force row level security;
alter table public.community_post_prs enable row level security;
alter table public.community_post_prs force row level security;

revoke all on table public.personal_records from public, anon, authenticated;
revoke all on table public.community_post_prs from public, anon, authenticated;

grant select on table public.personal_records to authenticated;
grant select on table public.community_post_prs to authenticated;

drop policy if exists personal_records_select_own on public.personal_records;
create policy personal_records_select_own
on public.personal_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists personal_records_insert_own on public.personal_records;
drop policy if exists personal_records_update_own on public.personal_records;
drop policy if exists personal_records_delete_own on public.personal_records;

drop policy if exists community_post_prs_select_member on public.community_post_prs;
create policy community_post_prs_select_member
on public.community_post_prs
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    private.can_access_community_post(post_id)
    and exists (
      select 1
      from public.community_posts as post
      where post.id = community_post_prs.post_id
        and post.removed_at is null
    )
    and not private.is_blocked_between(auth.uid(), community_post_prs.user_id)
  )
);

drop policy if exists community_post_prs_insert_own on public.community_post_prs;
drop policy if exists community_post_prs_update_own on public.community_post_prs;
drop policy if exists community_post_prs_delete_own on public.community_post_prs;
