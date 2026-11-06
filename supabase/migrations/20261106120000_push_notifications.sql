-- Push notifications v1: device tokens and reaction-batch column.
-- Apply after Drizzle 0017_gifted_calypso.sql and after
-- 20261106000000_crew_page.sql (#48).
--
-- The API uses a role that bypasses RLS. These policies close direct
-- PostgREST access with the publishable key. Users may only manage their
-- own device tokens.

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

alter table public.device_push_tokens enable row level security;
alter table public.device_push_tokens force row level security;
revoke all on table public.device_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.device_push_tokens to authenticated;

drop policy if exists device_push_tokens_select_own on public.device_push_tokens;
create policy device_push_tokens_select_own
on public.device_push_tokens
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists device_push_tokens_insert_own on public.device_push_tokens;
create policy device_push_tokens_insert_own
on public.device_push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists device_push_tokens_update_own on public.device_push_tokens;
create policy device_push_tokens_update_own
on public.device_push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists device_push_tokens_delete_own on public.device_push_tokens;
create policy device_push_tokens_delete_own
on public.device_push_tokens
for delete
to authenticated
using (user_id = auth.uid());
