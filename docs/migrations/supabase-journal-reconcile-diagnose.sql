-- READ-ONLY diagnose: supabase_migrations.schema_migrations vs repo files.
-- NOT a migration. Executes no application writes. Paste the whole file.
-- Run in the Supabase SQL editor on the target project. Ends ROLLBACK.
-- Reviewed main: 8859b97 (nine files under supabase/migrations/).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT
  current_database() AS database_name,
  current_user AS inspecting_role,
  r.rolsuper,
  r.rolbypassrls,
  pg_catalog.to_regclass('supabase_migrations.schema_migrations') AS journal_table
FROM pg_catalog.pg_roles AS r
WHERE r.rolname = current_user;

-- Live journal columns. CLI versions differ: v2.115.0 (this repo's last
-- recorded CLI in supabase/.temp/cli-latest) writes version text PK, name text,
-- statements text[]. Some hosted projects also have created_at.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

-- Raw journal rows (whatever columns this project has).
SELECT *
FROM supabase_migrations.schema_migrations
ORDER BY version::text;

-- Repo versions next to the journal, plus a read-only evidence check per file.
-- in_journal: a schema_migrations row exists for that version.
-- objects_present: every key object for that file exists.
-- object_hits / object_expected: catch a partial apply (stop; ask Dev).
WITH repo(version, name) AS (
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
),
journal AS (
  SELECT version::text AS version
  FROM supabase_migrations.schema_migrations
),
ev AS (
  SELECT
    EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'workout-photos'
    ) AS photos_bucket,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Workout photo owners can read'
    ) AS photos_read,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Workout photo owners can upload'
    ) AS photos_upload,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Workout photo owners can update'
    ) AS photos_update,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Workout photo owners can delete'
    ) AS photos_delete,
    pg_catalog.to_regnamespace('private') IS NOT NULL AS private_schema,
    pg_catalog.to_regprocedure('private.is_group_member(uuid)') IS NOT NULL
      AS is_group_member,
    pg_catalog.to_regprocedure('private.shares_group(uuid)') IS NOT NULL
      AS shares_group,
    pg_catalog.to_regprocedure('private.owns_workout_session(uuid)') IS NOT NULL
      AS owns_workout_session,
    pg_catalog.to_regprocedure('private.can_read_workout_session(uuid)') IS NOT NULL
      AS can_read_workout_session,
    pg_catalog.to_regprocedure('private.can_read_workout_definition(uuid)') IS NOT NULL
      AS can_read_workout_definition,
    pg_catalog.to_regprocedure('private.can_access_community_post(uuid)') IS NOT NULL
      AS can_access_community_post,
    pg_catalog.to_regprocedure('private.owns_photo_path(text)') IS NOT NULL
      AS owns_photo_path,
    pg_catalog.to_regprocedure('public.join_group_by_invite_code(text)') IS NOT NULL
      AS join_group_by_invite_code,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'users'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS users_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'workouts'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS workouts_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'users'
        AND p.polname = 'users_select_self_or_group_peer'
    ) AS users_select_policy,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'workouts'
        AND p.polname = 'workouts_select_own_or_group'
    ) AS workouts_select_policy,
    pg_catalog.to_regprocedure(
      'private.report_target_is_valid(uuid,text,uuid,uuid)'
    ) IS NOT NULL AS report_target_is_valid,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'content_reports'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS content_reports_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_blocks'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS user_blocks_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'content_reports'
        AND p.polname = 'content_reports_select_own'
    ) AS content_reports_select_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_blocks'
        AND p.polname = 'user_blocks_select_own'
    ) AS user_blocks_select_own,
    pg_catalog.to_regprocedure(
      'private.crew_content_visible(uuid,uuid,timestamptz)'
    ) IS NOT NULL AS crew_content_visible,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'crew_notification_prefs'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS crew_prefs_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'crew_notification_prefs'
        AND p.polname = 'crew_notification_prefs_select_own'
    ) AS crew_prefs_select_own,
    EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'crew-photos'
    ) AS crew_photos_bucket,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Crew photo owners can read'
    ) AS crew_photos_read,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Crew photo owners can upload'
    ) AS crew_photos_upload,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Crew photo owners can update'
    ) AS crew_photos_update,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Crew photo owners can delete'
    ) AS crew_photos_delete,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'device_push_tokens'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS device_push_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'device_push_tokens'
        AND p.polname = 'device_push_tokens_select_own'
    ) AS device_push_select_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'device_push_tokens'
        AND p.polname = 'device_push_tokens_insert_own'
    ) AS device_push_insert_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'device_push_tokens'
        AND p.polname = 'device_push_tokens_update_own'
    ) AS device_push_update_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'device_push_tokens'
        AND p.polname = 'device_push_tokens_delete_own'
    ) AS device_push_delete_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage'
        AND c.relname = 'objects'
        AND p.polname = 'Crew photo owners can read'
        AND pg_catalog.pg_get_expr(p.polqual, p.polrelid)
              ~* 'foldername\(name\)\)\[1\][[:space:]]+in[[:space:]]*\('
    ) AS crew_photos_foldername_rewrite,
    pg_catalog.to_regprocedure('private.is_blocked_between(uuid,uuid)') IS NOT NULL
      AS is_blocked_between,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'personal_records'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS personal_records_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'community_post_prs'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS community_post_prs_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'personal_records'
        AND p.polname = 'personal_records_select_own'
    ) AS personal_records_select_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'community_post_prs'
        AND p.polname = 'community_post_prs_select_member'
    ) AS community_post_prs_select_member,
    pg_catalog.to_regprocedure('private.goal_badge_post_visible(uuid)') IS NOT NULL
      AS goal_badge_post_visible,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'goals'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS goals_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'goal_periods'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS goal_periods_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'community_post_goals'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) AS community_post_goals_force_rls,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'goals'
        AND p.polname = 'goals_select_own'
    ) AS goals_select_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'goal_periods'
        AND p.polname = 'goal_periods_select_own'
    ) AS goal_periods_select_own,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS p
      JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'community_post_goals'
        AND p.polname = 'community_post_goals_select_member'
    ) AS community_post_goals_select_member,
    pg_catalog.to_regprocedure('private.community_post_visible_to(uuid,uuid)')
      IS NOT NULL AS community_post_visible_to,
    pg_catalog.to_regprocedure('private.community_comment_visible_to(uuid,uuid)')
      IS NOT NULL AS community_comment_visible_to,
    pg_catalog.to_regprocedure('private.community_reaction_visible_to(uuid,uuid)')
      IS NOT NULL AS community_reaction_visible_to,
    pg_catalog.to_regprocedure('private.can_read_community_comment(uuid)')
      IS NOT NULL AS can_read_community_comment,
    pg_catalog.to_regprocedure('private.can_read_community_reaction(uuid)')
      IS NOT NULL AS can_read_community_reaction
),
scored AS (
  SELECT
    r.version,
    r.name,
    (j.version IS NOT NULL) AS in_journal,
    CASE r.version
      WHEN '20260822000000' THEN
        ev.photos_bucket AND ev.photos_read AND ev.photos_upload
        AND ev.photos_update AND ev.photos_delete
      WHEN '20261030140000' THEN
        ev.private_schema AND ev.is_group_member AND ev.shares_group
        AND ev.owns_workout_session AND ev.can_read_workout_session
        AND ev.can_read_workout_definition AND ev.can_access_community_post
        AND ev.owns_photo_path AND ev.join_group_by_invite_code
        AND ev.users_force_rls AND ev.workouts_force_rls
        AND ev.users_select_policy AND ev.workouts_select_policy
      WHEN '20261102160000' THEN
        ev.report_target_is_valid AND ev.content_reports_force_rls
        AND ev.user_blocks_force_rls AND ev.content_reports_select_own
        AND ev.user_blocks_select_own
      WHEN '20261106000000' THEN
        ev.crew_content_visible AND ev.crew_prefs_force_rls
        AND ev.crew_prefs_select_own AND ev.crew_photos_bucket
        AND ev.crew_photos_read AND ev.crew_photos_upload
        AND ev.crew_photos_update AND ev.crew_photos_delete
        AND ev.join_group_by_invite_code
      WHEN '20261106120000' THEN
        ev.device_push_force_rls AND ev.device_push_select_own
        AND ev.device_push_insert_own AND ev.device_push_update_own
        AND ev.device_push_delete_own
      WHEN '20261107000000' THEN
        ev.crew_photos_read AND ev.crew_photos_upload
        AND ev.crew_photos_update AND ev.crew_photos_delete
        AND ev.crew_photos_foldername_rewrite
      WHEN '20261109000000' THEN
        ev.is_blocked_between AND ev.personal_records_force_rls
        AND ev.community_post_prs_force_rls
        AND ev.personal_records_select_own
        AND ev.community_post_prs_select_member
      WHEN '20261110000000' THEN
        ev.goal_badge_post_visible AND ev.goals_force_rls
        AND ev.goal_periods_force_rls AND ev.community_post_goals_force_rls
        AND ev.goals_select_own AND ev.goal_periods_select_own
        AND ev.community_post_goals_select_member
      WHEN '20261111000000' THEN
        ev.community_post_visible_to AND ev.community_comment_visible_to
        AND ev.community_reaction_visible_to
        AND ev.can_read_community_comment
        AND ev.can_read_community_reaction
      ELSE false
    END AS objects_present,
    CASE r.version
      WHEN '20260822000000' THEN
        ev.photos_bucket::int + ev.photos_read::int + ev.photos_upload::int
        + ev.photos_update::int + ev.photos_delete::int
      WHEN '20261030140000' THEN
        ev.private_schema::int + ev.is_group_member::int + ev.shares_group::int
        + ev.owns_workout_session::int + ev.can_read_workout_session::int
        + ev.can_read_workout_definition::int + ev.can_access_community_post::int
        + ev.owns_photo_path::int + ev.join_group_by_invite_code::int
        + ev.users_force_rls::int + ev.workouts_force_rls::int
        + ev.users_select_policy::int + ev.workouts_select_policy::int
      WHEN '20261102160000' THEN
        ev.report_target_is_valid::int + ev.content_reports_force_rls::int
        + ev.user_blocks_force_rls::int + ev.content_reports_select_own::int
        + ev.user_blocks_select_own::int
      WHEN '20261106000000' THEN
        ev.crew_content_visible::int + ev.crew_prefs_force_rls::int
        + ev.crew_prefs_select_own::int + ev.crew_photos_bucket::int
        + ev.crew_photos_read::int + ev.crew_photos_upload::int
        + ev.crew_photos_update::int + ev.crew_photos_delete::int
        + ev.join_group_by_invite_code::int
      WHEN '20261106120000' THEN
        ev.device_push_force_rls::int + ev.device_push_select_own::int
        + ev.device_push_insert_own::int + ev.device_push_update_own::int
        + ev.device_push_delete_own::int
      WHEN '20261107000000' THEN
        ev.crew_photos_read::int + ev.crew_photos_upload::int
        + ev.crew_photos_update::int + ev.crew_photos_delete::int
        + ev.crew_photos_foldername_rewrite::int
      WHEN '20261109000000' THEN
        ev.is_blocked_between::int + ev.personal_records_force_rls::int
        + ev.community_post_prs_force_rls::int
        + ev.personal_records_select_own::int
        + ev.community_post_prs_select_member::int
      WHEN '20261110000000' THEN
        ev.goal_badge_post_visible::int + ev.goals_force_rls::int
        + ev.goal_periods_force_rls::int + ev.community_post_goals_force_rls::int
        + ev.goals_select_own::int + ev.goal_periods_select_own::int
        + ev.community_post_goals_select_member::int
      WHEN '20261111000000' THEN
        ev.community_post_visible_to::int + ev.community_comment_visible_to::int
        + ev.community_reaction_visible_to::int
        + ev.can_read_community_comment::int
        + ev.can_read_community_reaction::int
      ELSE 0
    END AS object_hits,
    CASE r.version
      WHEN '20260822000000' THEN 5
      WHEN '20261030140000' THEN 13
      WHEN '20261102160000' THEN 5
      WHEN '20261106000000' THEN 9
      WHEN '20261106120000' THEN 5
      WHEN '20261107000000' THEN 5
      WHEN '20261109000000' THEN 5
      WHEN '20261110000000' THEN 7
      WHEN '20261111000000' THEN 5
      ELSE 0
    END AS object_expected
  FROM repo AS r
  LEFT JOIN journal AS j ON j.version = r.version
  CROSS JOIN ev
)
SELECT
  version,
  name,
  in_journal,
  objects_present,
  object_hits,
  object_expected,
  (NOT in_journal) AS missing_from_journal,
  CASE
    WHEN in_journal AND objects_present THEN 'ok'
    WHEN (NOT in_journal) AND objects_present THEN 'repair candidate'
    WHEN object_hits > 0 AND NOT objects_present
      THEN 'STOP: partial objects — ask Dev'
    WHEN in_journal AND NOT objects_present
      THEN 'STOP: journal row without objects — ask Dev'
    ELSE 'missing from journal and objects'
  END AS verdict
FROM scored
ORDER BY version;

-- Journal versions that are not in supabase/migrations/ (should be empty).
SELECT j.version::text AS extra_journal_version
FROM supabase_migrations.schema_migrations AS j
WHERE j.version::text NOT IN (
  '20260822000000',
  '20261030140000',
  '20261102160000',
  '20261106000000',
  '20261106120000',
  '20261107000000',
  '20261109000000',
  '20261110000000',
  '20261111000000'
)
ORDER BY j.version::text;

-- Eyeball the crew-photos read policy. 20261107000000 rewrote foldername() to
-- the outer policy scope (`(storage.foldername(name))[1] IN (...)`).
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname AS policy_name,
  p.polcmd AS command,
  pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS using_predicate,
  pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_predicate
FROM pg_catalog.pg_policy AS p
JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
  AND c.relname = 'objects'
  AND p.polname LIKE 'Crew photo owners%'
ORDER BY p.polname;

ROLLBACK;
