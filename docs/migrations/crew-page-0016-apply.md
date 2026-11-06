# Crew page — apply 0016 (corrected)

Josue applies this on the target Supabase database. Do not run it from CI or
this PR. Do not edit `packages/db/drizzle/0016_modern_layla_miller.sql`,
`packages/db/drizzle/meta/_journal.json`, or any snapshot.

[#48](https://github.com/Swayzee20/repin/pull/48) put the crew-page apply
steps in its PR body. Step 1 verification used

```sql
where conrelid = 'public.crew_notification_prefs'::regclass
```

That `::regclass` cast throws `42P01` (`relation does not exist`) when the
table is missing, instead of returning no rows. A `42P01` from that query
means the table was not there; it does not mean a migration was left
half-applied.

The Supabase SQL editor and `drizzle-kit migrate` (`pnpm --filter @repin/db
db:migrate`) each run in a **single transaction**. If a run fails, Postgres
rolls it back and nothing from that run is left partial.

The SQL below also lives as files under
[`docs/migrations/crew-page-0016/`](crew-page-0016/).

## Apply order

1. **0016** — `pnpm --filter @repin/db db:migrate` if
   `drizzle.__drizzle_migrations` exists and that is how migrations are
   normally applied; otherwise the idempotent script in the SQL editor.
2. **Corrected step 1 verification** (this doc).
3. **`supabase/migrations/20261106000000_crew_page.sql`** in the SQL editor.
4. **[#48](https://github.com/Swayzee20/repin/pull/48) step 2 verification**.
5. **Storage dashboard** — only if step 3 printed `RAISE NOTICE` lines about
   insufficient privilege.

Diagnose first if it is unclear whether 0016 already landed (for example
after the old verification threw `42P01`). If step 1 objects are already
present, skip applying 0016 and go to verification.

## 0. Diagnose (read-only)

Changes nothing. `drizzle_tracking_table` is not null when Drizzle's history
table exists.

```sql
-- READ-ONLY. Safe to run in the Supabase SQL editor. Changes nothing.
select
  to_regclass('public.crew_notification_prefs')            as prefs_table,
  to_regclass('public.crew_notification_prefs_group_id_idx') as prefs_index,
  to_regclass('public.group_members_group_active_idx')     as gm_index,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups'        and column_name='photo_path')            as groups_photo_path,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups'        and column_name='closed_at')             as groups_closed_at,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='group_members' and column_name='left_at')               as gm_left_at,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='group_members' and column_name='content_visible_after') as gm_content_visible_after,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crew_content_visible') as step2_ran,
  to_regclass('drizzle.__drizzle_migrations')              as drizzle_tracking_table;
```

## 1. Apply 0016

**Pick one.** Do not paste the raw Drizzle file into the SQL editor unless
you are sure it has never been applied: that file is not idempotent.

### A. `db:migrate` (preferred when Drizzle tracking is already in use)

Use this when `drizzle_tracking_table` is present **and** migrations are
normally applied with Drizzle. Export `DATABASE_URL` for the **target**
Supabase database (not a local agent or CI database):

```bash
export DATABASE_URL=postgresql://postgres:...@.../postgres
pnpm --filter @repin/db db:migrate
```

That applies every pending Drizzle migration, including
`0016_modern_layla_miller`, and records 0016 in
`drizzle.__drizzle_migrations`. 0016 is currently the latest journal entry.

### B. Idempotent SQL editor script

Use this when the tracking table is missing, or when you do not apply
schema with `db:migrate`. Safe to re-run: it skips objects that already
exist. Same table, columns, types, defaults, constraint names, FK actions,
and indexes as `packages/db/drizzle/0016_modern_layla_miller.sql`.

```sql
-- Idempotent equivalent of packages/db/drizzle/0016_modern_layla_miller.sql.
-- Safe to re-run: skips anything that already exists. All-or-nothing (one transaction).
begin;

create table if not exists public.crew_notification_prefs (
  user_id    uuid    not null,
  group_id   uuid    not null,
  alert_type text    not null,
  enabled    boolean not null default true,
  constraint crew_notification_prefs_user_id_group_id_alert_type_pk primary key (user_id, group_id, alert_type),
  constraint crew_notification_prefs_alert_type_check
    check (alert_type in ('crew_workout', 'crew_comment', 'crew_reaction', 'mute_all'))
);

alter table public.group_members add column if not exists left_at timestamp with time zone;
alter table public.group_members add column if not exists content_visible_after timestamp with time zone not null default '-infinity';
alter table public.groups        add column if not exists photo_path text;
alter table public.groups        add column if not exists closed_at  timestamp with time zone;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_notification_prefs_user_id_users_id_fk') then
    alter table public.crew_notification_prefs
      add constraint crew_notification_prefs_user_id_users_id_fk
      foreign key (user_id) references public.users(id) on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crew_notification_prefs_group_id_groups_id_fk') then
    alter table public.crew_notification_prefs
      add constraint crew_notification_prefs_group_id_groups_id_fk
      foreign key (group_id) references public.groups(id) on delete cascade on update no action;
  end if;
end $$;

create index if not exists crew_notification_prefs_group_id_idx on public.crew_notification_prefs using btree (group_id);
create index if not exists group_members_group_active_idx    on public.group_members          using btree (group_id);

commit;
```

Running this by hand **does not** insert a row into
`drizzle.__drizzle_migrations`. Drizzle's history then still thinks 0016 is
pending. If you later switch to `db:migrate`, drizzle-kit will try to run
`packages/db/drizzle/0016_modern_layla_miller.sql`. That file uses plain
`CREATE TABLE` / `ADD COLUMN` (no `IF NOT EXISTS`), so it will fail once
the objects already exist.

Before that switch, 0016 must be marked as applied in
`drizzle.__drizzle_migrations` the same way drizzle-kit would have recorded
journal entry `0016_modern_layla_miller` (hash of that SQL file, and a
`created_at` that matches how drizzle-kit watermarks journal `when`
values). Do not invent a wall-clock `created_at`: drizzle-kit treats the
latest `created_at` as a watermark and can skip later migrations. This
doc does not automate that insert.

## 2. Verify step 1 (corrected)

No `::regclass` cast. If the table is missing, these return zero rows
instead of `42P01`.

```sql
-- READ-ONLY. Corrected verification for step 1 (no ::regclass cast, so it can't error if the table is missing).
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'groups' and column_name in ('photo_path','closed_at'))
    or (table_name = 'group_members' and column_name in ('left_at','content_visible_after')))
order by table_name, column_name;

select c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'crew_notification_prefs'
order by c.conname;
```

Expect:

- `photo_path`, `closed_at`, `left_at` nullable; `content_visible_after`
  `NOT NULL` with default `'-infinity'::timestamp with time zone`
- constraints named
  `crew_notification_prefs_user_id_group_id_alert_type_pk`,
  `crew_notification_prefs_alert_type_check` (listing `crew_workout`,
  `crew_comment`, `crew_reaction`, `mute_all`),
  `crew_notification_prefs_user_id_users_id_fk`,
  `crew_notification_prefs_group_id_groups_id_fk`

## 3. Apply the Supabase crew-page SQL

After step 1 verifies, paste and run
`supabase/migrations/20261106000000_crew_page.sql` in the SQL editor.

That file:

- Updates `private.is_group_member` / `private.shares_group` to require
  `left_at is null`
- Adds `private.crew_content_visible` and tightens post/comment/reaction
  SELECT policies
- Enables FORCE RLS on `crew_notification_prefs`
- Updates `join_group_by_invite_code` for rejoin + closed crews
- Creates the private `crew-photos` bucket and owner-only object policies

If the SQL editor is not the table owner, it `RAISE NOTICE`s instead of
failing on storage. Then do step 5.

## 4. Verify step 2 (from #48)

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and proname in ('is_group_member', 'shares_group', 'crew_content_visible', 'can_access_community_post')
order by proname;

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'crew_notification_prefs';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'crew_notification_prefs'
order by cmd;
```

Expect four policies (DELETE / INSERT / SELECT / UPDATE) and FORCE RLS on.

Optional — join function rejects closed crews (skip until a solo leave, or
after creating a test closed group):

```sql
select pg_get_functiondef('public.join_group_by_invite_code(text)'::regprocedure);
```

The body should mention `closed_at is null` and
`content_visible_after = now()` on rejoin.

## 5. Storage dashboard (only if step 3 printed notices)

Supabase Dashboard → Storage:

1. Create bucket `crew-photos`
2. Public: **off**
3. File size limit: 10 MB
4. Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`
5. Recreate the four policies from the SQL file (`Crew photo owners can
   read/upload/update/delete`), folder `[1]` = `groups.id`,
   `groups.owner_id = auth.uid()`

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'crew-photos';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'Crew photo%'
order by policyname;
```

Expect one private bucket and four owner policies. Members read photos
through the API signed URL after membership is checked. They do not get a
direct storage read policy.
