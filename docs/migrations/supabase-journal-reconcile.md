# Reconcile the Supabase migration journal

Josue applies this on the **target** Supabase project after the PR is approved.
Do not run it from CI or this PR. Do not apply it from an agent environment.
Do not use hosted credentials from an agent environment.

This writes **journal metadata only**. It does not run any file in
`supabase/migrations/`. It does not disable RLS, change grants, or touch
Drizzle tracking.

## Why

Production `supabase_migrations.schema_migrations` currently lists only
`20260822000000_workout_photos`. Every later file in `supabase/migrations/`
was applied by pasting it into the Supabase SQL editor, so the journal does
not know about those versions. `supabase db push` compares local filenames
to that table **by version only**. If anyone pushes now, the CLI will try to
re-run those already-applied files against production.

Drizzle is a **separate** track (`packages/db/drizzle`, table
`drizzle.__drizzle_migrations`). Production already has Drizzle 0020 recorded
as id 21 with a hash that matches the file. This guide does not read or write
that table. `supabase db push` does not apply Drizzle migrations.

## Order

1. **Diagnose** (read-only) — paste
   [`supabase-journal-reconcile-diagnose.sql`](./supabase-journal-reconcile-diagnose.sql).
2. **Reconcile** — mark missing versions applied, only where evidence passed.
3. **Verify** (read-only) — rerun diagnose; confirm `supabase migration list`.
4. **`db push` is safe again** only after verify, a dry-run, and a backup.

The diagnose script is `BEGIN READ ONLY` … `ROLLBACK`. The preferred repair
command writes one journal row and never executes migration SQL.

## 1. Inventory (`supabase/migrations/`)

Taken from the files on this revision of `main`. Version is the filename
timestamp prefix. Name is the remainder. Main objects are what that file
creates or replaces (not every grant or `DROP POLICY IF EXISTS`).

| Version | Name | Main objects |
|---|---|---|
| `20260822000000` | `workout_photos` | Storage bucket `workout-photos` (private, 10 MB, jpeg/png/webp/heic/heif). Policies on `storage.objects`: `Workout photo owners can read/upload/update/delete`. |
| `20261030140000` | `enable_row_level_security` | Schema `private`. Helpers `private.is_group_member`, `shares_group`, `owns_workout_session`, `can_read_workout_session`, `owns_workout_definition`, `can_read_workout_definition`, `owns_workout_block`, `can_read_workout_block`, `owns_session_movement`, `can_read_session_movement`, `can_access_community_post`, `owns_photo_path`. `public.join_group_by_invite_code(text)`. ENABLE+FORCE RLS on `users`, `groups`, `group_members`, `workouts`, `movements`, `workout_definitions`, `workout_blocks`, `block_movements`, `workout_sessions`, `workout_session_metrics`, `workout_session_segments`, `session_movement_results`, `set_results`, `community_posts`, `community_post_reactions`, `community_post_comments`. Matching SELECT / owner-write policies (including `users_select_self_or_group_peer`, `workouts_select_own_or_group`). |
| `20261102160000` | `moderation` | Helper `private.report_target_is_valid`. ENABLE+FORCE RLS on `content_reports`, `user_blocks`. Policies `content_reports_select_own` / `insert_member` / `update_none` / `delete_none`, `user_blocks_select_own` / `insert_own` / `update_own` / `delete_own`. |
| `20261106000000` | `crew_page` | Replaces `private.is_group_member` / `shares_group` (active membership). Adds `private.crew_content_visible`. Replaces `private.can_access_community_post` and crew SELECT policies. ENABLE+FORCE RLS on `crew_notification_prefs` with four owner policies. Rewrites `public.join_group_by_invite_code` (rejoin + closed crews). Storage bucket `crew-photos` and four `Crew photo owners can read/upload/update/delete` policies on `storage.objects`. |
| `20261106120000` | `push_notifications` | ENABLE+FORCE RLS on `device_push_tokens`. Policies `device_push_tokens_select_own` / `insert_own` / `update_own` / `delete_own`. Table itself comes from Drizzle 0017. |
| `20261107000000` | `crew_photos_foldername` | `ALTER POLICY` on the four crew-photos `storage.objects` policies so `storage.foldername(name)` is evaluated at the outer policy scope. Same policy names. No new bucket. |
| `20261109000000` | `personal_records` | Helper `private.is_blocked_between`. ENABLE+FORCE RLS on `personal_records`, `community_post_prs`. SELECT policies `personal_records_select_own`, `community_post_prs_select_member`. Tables come from Drizzle 0018. |
| `20261110000000` | `goals` | Helper `private.goal_badge_post_visible`. ENABLE+FORCE RLS on `goals`, `goal_periods`, `community_post_goals`. SELECT policies `goals_select_own`, `goal_periods_select_own`, `community_post_goals_select_member`. Tables come from Drizzle 0019. |
| `20261111000000` | `workout_read_visibility` | Helpers `private.community_post_visible_to`, `community_comment_visible_to`, `community_reaction_visible_to`, `can_read_community_comment`, `can_read_community_reaction`. Replaces `can_access_community_post`, `can_read_workout_session`, `can_read_workout_definition`. Replaces SELECT policies on `workouts`, `community_posts`, `community_post_comments`, `community_post_reactions`, `community_post_prs`. Reasserts ENABLE+FORCE on the application tables. No new tables. |

Nine files. Later files replace some helpers and policies created earlier; those
objects still count as evidence that the earlier file landed.

## 2. Diagnose (read-only)

Changes nothing. Paste the whole file:

[`docs/migrations/supabase-journal-reconcile-diagnose.sql`](./supabase-journal-reconcile-diagnose.sql)

It is `BEGIN READ ONLY` … `ROLLBACK`. If
`supabase_migrations.schema_migrations` is missing, stop — this project has
no CLI journal to repair.

The script:

1. Shows the inspecting role and whether the journal table exists.
2. Lists **live journal columns**. Confirm these before any raw `INSERT`.
   This repo last recorded CLI **v2.115.0** in `supabase/.temp/cli-latest`.
   That CLI (and current CLI source) uses:

   | Column | Type | Role |
   |---|---|---|
   | `version` | `text` **PRIMARY KEY** | Filename timestamp. Matching is by this column only. |
   | `name` | `text` | Remainder of the filename (`workout_photos`, …). |
   | `statements` | `text[]` | Parsed SQL from the file. **Not executed** by repair. |

   Some hosted projects also have `created_at`. Older CLIs used only
   `version`. Columns differ by CLI version — believe the live
   `information_schema` result, not this table.
3. Selects every journal row next to this repo VALUES list:

   ```sql
   VALUES
     ('20260822000000', 'workout_photos'),
     ('20261030140000', 'enable_row_level_security'),
     ('20261102160000', 'moderation'),
     ('20261106000000', 'crew_page'),
     ('20261106120000', 'push_notifications'),
     ('20261107000000', 'crew_photos_foldername'),
     ('20261109000000', 'personal_records'),
     ('20261110000000', 'goals'),
     ('20261111000000', 'workout_read_visibility')
   ```
4. For each version, a read-only evidence check (`to_regclass` /
   `to_regprocedure`, `pg_class` ENABLE+FORCE flags, `pg_policy`,
   `storage.buckets`). Result columns:

   | Column | Meaning |
   |---|---|
   | `in_journal` | Journal row exists for that version. |
   | `objects_present` | Every key object for that file exists. |
   | `object_hits` / `object_expected` | Count of those checks. |
   | `missing_from_journal` | `NOT in_journal`. |
   | `verdict` | What to do. |

   Verdict:

   | verdict | Action |
   |---|---|
   | `ok` | Already recorded and objects exist. Skip. |
   | `repair candidate` | Objects exist, journal row missing. Safe to mark applied. |
   | `STOP: partial objects — ask Dev` | Some objects exist, not all. **Do not** mark applied. |
   | `STOP: journal row without objects — ask Dev` | Journal thinks it ran; objects are missing. |
   | `missing from journal and objects` | File never landed. Do **not** mark applied; apply the migration itself instead (separate change). |

Expected on production **before** reconcile: `20260822000000` is `ok`; the
other eight are `repair candidate` if those pastes fully landed.

The last result set prints the four crew-photos policy expressions. Confirm
`20261107000000` rewrote `foldername()` to the outer scope
(`(storage.foldername(name))[1] IN (...)`). If the regex evidence is false
but the printed expression is clearly the rewrite, treat objects as present.
If the expression still uses `groups.id::text = (storage.foldername(name))[1]`
inside `EXISTS`, that version is not done — stop and ask Dev.

## 3. Reconcile

**Never mark a version applied unless its evidence check passed**
(`verdict = repair candidate`, or `ok` which needs no repair).

If any version is only partly present, **stop and ask Dev**. Do not repair
around a partial apply. Do not disable RLS. Do not change grants. Do not
run the migration SQL from this guide.

This does **not** run any migration SQL. It only inserts (or, for reverted,
deletes) a row in `supabase_migrations.schema_migrations`.

Keep the CLI linked to the **right** project. Run `supabase --version` and
`supabase migration list` (see §4) and confirm the target name / ref before
repair. Default CLI target is the **local** database. Production needs
`--linked` (CLI v2, including v2.115.0) or `--remote` (CLI v3+). Check
`supabase migration repair --help` for the flag your binary expects.

### Preferred: `supabase migration repair --status applied`

One command per version, **only** for versions whose evidence passed and
that are missing from the journal. Example for the eight expected gaps:

```bash
supabase --version
# This repo last recorded v2.115.0 in supabase/.temp/cli-latest.

# Confirm the linked project is production, then:
supabase migration repair --status applied 20261030140000 --linked
supabase migration repair --status applied 20261102160000 --linked
supabase migration repair --status applied 20261106000000 --linked
supabase migration repair --status applied 20261106120000 --linked
supabase migration repair --status applied 20261107000000 --linked
supabase migration repair --status applied 20261109000000 --linked
supabase migration repair --status applied 20261110000000 --linked
supabase migration repair --status applied 20261111000000 --linked
```

On CLI v3+, replace `--linked` with `--remote`. Do **not** pass
`20260822000000` unless diagnose showed it missing (it should already be
`ok`). Skip any version that is already `ok`. Never pass a `STOP:` version.

`supabase migration repair --status applied <version>`:

- Reads the matching local file `supabase/migrations/<version>_*.sql`.
- Inserts one row into `supabase_migrations.schema_migrations`
  (`version`, `name`, `statements` on v2.115.0 / current CLI).
- **Does not execute** that file’s SQL. `statements` is stored as metadata.

`--status reverted` **deletes** the journal row for that version. The next
`supabase db push` will treat the file as pending and **run its SQL**. Never
use `reverted` casually. Use it only to undo a mistaken `applied` mark when
you have confirmed the objects should stay and the SQL must not be re-run
until you intend to. Hosted repair asks for confirmation; the default is No.

### Fallback: raw `INSERT` (only if the CLI cannot be used)

Inspect the live column list from diagnose first. Wrap in a transaction.
Insert **only** versions whose evidence passed. This also does not run
migration SQL.

v2.115.0 / current CLI shape:

```sql
begin;

-- Live columns can differ by CLI version. Confirm information_schema first.
-- v2.115.0 writes (version text PK, name text, statements text[]).
-- statements NULL is enough for skip-by-version; CLI repair fills the array
-- from the local file without executing it. Prefer that.
insert into supabase_migrations.schema_migrations
  (version, name, statements)
values
  ('20261030140000', 'enable_row_level_security', null),
  ('20261102160000', 'moderation', null),
  ('20261106000000', 'crew_page', null),
  ('20261106120000', 'push_notifications', null),
  ('20261107000000', 'crew_photos_foldername', null),
  ('20261109000000', 'personal_records', null),
  ('20261110000000', 'goals', null),
  ('20261111000000', 'workout_read_visibility', null);

-- Review the inserted rows, then COMMIT. Roll back if the list is wrong.
select version, name, statements is null as statements_null
from supabase_migrations.schema_migrations
order by version;

-- commit;
rollback;
```

If the live table has only `version`, insert that column:

```sql
begin;
insert into supabase_migrations.schema_migrations (version)
values
  ('20261030140000'),
  ('20261102160000'),
  ('20261106000000'),
  ('20261106120000'),
  ('20261107000000'),
  ('20261109000000'),
  ('20261110000000'),
  ('20261111000000');
-- commit;
rollback;
```

Do not add columns. Do not `TRUNCATE` the journal. Do not insert
`20260822000000` again (`schema_migrations_pkey` will fail, and it should
already be present). Replace `rollback` with `commit` only after the
`SELECT` looks right.

## 4. Verify (read-only)

Rerun
[`supabase-journal-reconcile-diagnose.sql`](./supabase-journal-reconcile-diagnose.sql).

Expect every repo version: `in_journal = true`, `objects_present = true`,
`verdict = ok`. Extra journal versions (not in the repo) should still be
empty.

Then:

```bash
supabase migration list --linked
```

(`--remote` on CLI v3+.)

Example of an **in-sync** tree (Local and Remote aligned):

```
        LOCAL          │     REMOTE         │     TIME (UTC)
  ─────────────────────┼────────────────────┼──────────────────────
    20260822000000     │ 20260822000000     │ 2026-08-22 00:00:00
    20261030140000     │ 20261030140000     │ 2026-10-30 14:00:00
    20261102160000     │ 20261102160000     │ 2026-11-02 16:00:00
    20261106000000     │ 20261106000000     │ 2026-11-06 00:00:00
    20261106120000     │ 20261106120000     │ 2026-11-06 12:00:00
    20261107000000     │ 20261107000000     │ 2026-11-07 00:00:00
    20261109000000     │ 20261109000000     │ 2026-11-09 00:00:00
    20261110000000     │ 20261110000000     │ 2026-11-10 00:00:00
    20261111000000     │ 20261111000000     │ 2026-11-11 00:00:00
```

- **LOCAL** is each file in `supabase/migrations/`.
- **REMOTE** (or **Local DB** when targeting the local stack) is each row in
  `supabase_migrations.schema_migrations`.
- The CLI compares **timestamps only**. When both columns show the same
  version, that file will not be applied again.
- Empty REMOTE = pending (`db push` would run that file). That is the
  pre-reconcile shape for everything after `20260822000000`.
- Empty LOCAL = a remote version the repo does not have. Diagnose’s
  `extra_journal_version` list should catch that. Do not delete it from
  this guide.

Before reconcile, `20260822000000` should appear in both columns and the
later versions only under LOCAL.

## 5. When `supabase db push` is safe again

All three:

1. Diagnose verify shows **no gaps** (every version `verdict = ok`).
2. `supabase db push --dry-run --linked` (or `--remote`) shows nothing
   pending, or only the **intended new** migration you are about to add.
   In-sync output is `Remote database is up to date.`
3. The database is **backed up** first (Supabase dashboard backup / PITR,
   or a dump you can restore). Dry-run does not write; the real push does.

Reminders:

- `supabase db push` applies **only** `supabase/migrations/*.sql` that are
  missing from `supabase_migrations.schema_migrations`. It does **not**
  apply Drizzle files in `packages/db/drizzle`.
- Drizzle stays on `pnpm --filter @repin/db db:migrate` /
  `drizzle.__drizzle_migrations`. Production already has 0020 as **id 21**
  with a hash matching `packages/db/drizzle/0020_workout_read_visibility.sql`.
  Do not insert or rewrite that row from this guide. Optional read-only
  check, only if `to_regclass('drizzle.__drizzle_migrations')` is not null:

  ```sql
  -- READ-ONLY. Run only when drizzle tracking exists.
  -- PostgreSQL still parses drizzle.__drizzle_migrations inside EXISTS
  -- even when guarded by to_regclass, so do not run this when the
  -- table is missing.
  select id, hash, created_at
  from drizzle.__drizzle_migrations
  order by id;
  ```

  Expect a row `id = 21` whose `hash` matches the 0020 file as drizzle-kit
  records it. Do not invent a hash.

## 6. Rollback

Deleting a mistaken journal row also touches **only metadata**. Objects
stay. Equivalent CLI:

```bash
supabase migration repair --status reverted 20261111000000 --linked
```

That is the same as:

```sql
begin;
delete from supabase_migrations.schema_migrations
where version = '20261111000000';
-- commit;
rollback;
```

After a delete, `db push` will try to **run that file’s SQL**. Only revert a
row you marked by mistake, and only when you are ready for that risk — or
re-run diagnose and `repair --status applied` again if the objects are still
present and you still want the journal to skip the file.

Do not `DROP` functions, policies, buckets, or tables as a journal rollback.
Do not disable RLS.
