-- Rewrite crew-photos storage.objects policies so foldername(name) is evaluated
-- at the outer policy scope (storage.objects.name = upload path), not inside
-- FROM public.groups where unqualified name binds to groups.name (crew title).
--
-- Owner-only, private bucket, same policy names / roles / commands as
-- 20261106000000_crew_page.sql. No SECURITY DEFINER, grant changes, or bucket
-- updates. Fails if the four crew-photos policies are missing.

do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception
      'storage.objects is required before rewriting crew-photos policies. Apply 20261106000000_crew_page.sql first.';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Crew photo owners can read',
        'Crew photo owners can upload',
        'Crew photo owners can update',
        'Crew photo owners can delete'
      )
  ) <> 4 then
    raise exception
      'Expected four crew-photos policies on storage.objects. Apply 20261106000000_crew_page.sql first.';
  end if;
end $$;

alter policy "Crew photo owners can read"
  on storage.objects
  using (
    bucket_id = 'crew-photos'
    and (storage.foldername(name))[1] in (
      select groups.id::text
      from public.groups
      where groups.owner_id = auth.uid()
    )
  );

alter policy "Crew photo owners can upload"
  on storage.objects
  with check (
    bucket_id = 'crew-photos'
    and (storage.foldername(name))[1] in (
      select groups.id::text
      from public.groups
      where groups.owner_id = auth.uid()
    )
  );

alter policy "Crew photo owners can update"
  on storage.objects
  using (
    bucket_id = 'crew-photos'
    and (storage.foldername(name))[1] in (
      select groups.id::text
      from public.groups
      where groups.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'crew-photos'
    and (storage.foldername(name))[1] in (
      select groups.id::text
      from public.groups
      where groups.owner_id = auth.uid()
    )
  );

alter policy "Crew photo owners can delete"
  on storage.objects
  using (
    bucket_id = 'crew-photos'
    and (storage.foldername(name))[1] in (
      select groups.id::text
      from public.groups
      where groups.owner_id = auth.uid()
    )
  );
