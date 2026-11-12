-- READ-ONLY post-apply verification; NOT a migration. Executes no application writes.
-- Run only after Josue applies 0021 + 20261112000000. Review mismatches, never auto-fix them.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT current_database() AS database_name, current_user AS inspecting_role,
       r.rolsuper, r.rolbypassrls
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user;

WITH expected(table_name) AS (VALUES
  ('community_posts'),
  ('general_publications'),
  ('general_publication_photos'),
  ('general_publication_links'),
  ('general_publication_upload_reservations'),
  ('crew_pinned_posts'),
  ('content_report_evidence'),
  ('push_notification_dedupe'),
  ('content_reports'),
  ('device_push_tokens')
)
SELECT e.table_name, c.oid IS NOT NULL AS table_exists,
       c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
FROM expected e
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY e.table_name;

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'community_posts'
  AND column_name IN ('kind', 'workout_session_id', 'publication_id', 'edited_at')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.community_posts'::regclass
  AND conname IN ('community_posts_kind_check', 'community_posts_kind_shape_check')
ORDER BY conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('community_posts', 'crew_pinned_posts')
  AND indexname IN (
    'community_posts_group_session_unique',
    'community_posts_group_publication_unique',
    'community_posts_id_group_unique',
    'crew_pinned_posts_pkey'
  )
ORDER BY indexname;

SELECT n.nspname AS schema, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       p.provolatile,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('private', 'community_post_visible_to'),
  ('private', 'general_publication_visible_to'),
  ('private', 'can_access_community_post'),
  ('private', 'can_access_general_publication'),
  ('private', 'cleanup_expired_report_evidence')
)
ORDER BY n.nspname, p.proname;

SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'general_publications','general_publication_photos','general_publication_links',
    'general_publication_upload_reservations','crew_pinned_posts',
    'content_report_evidence','push_notification_dedupe','community_posts'
  )
ORDER BY tablename, cmd, policyname;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.crew_notification_prefs'::regclass
  AND conname = 'crew_notification_prefs_alert_type_check';

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_push_tokens'
  AND column_name = 'supports_post_targets';

ROLLBACK;
