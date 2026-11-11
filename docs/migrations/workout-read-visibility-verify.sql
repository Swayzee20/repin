-- READ-ONLY post-apply verification; NOT a migration. Executes no application writes.
-- Reviewed main: 0e44437ef26eb7dbde30897ae25e111a1cbb9746.
-- Run only after separate implementation/apply approval. Review mismatches, never auto-fix them.
-- Optional role simulation at bottom is commented, uses synthetic UUIDs and ends ROLLBACK.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT current_database() AS database_name,current_user AS inspecting_role,
       r.rolsuper,r.rolbypassrls
FROM pg_catalog.pg_roles r WHERE r.rolname=current_user;

-- Every named table must exist and both flags must be TRUE.
WITH expected(table_name) AS (VALUES
 ('workouts'),('movements'),('workout_definitions'),('workout_blocks'),('block_movements'),
 ('workout_sessions'),('workout_session_metrics'),('workout_session_segments'),
 ('session_movement_results'),('set_results'),('community_posts'),('community_post_comments'),
 ('community_post_reactions'),('personal_records'),('community_post_prs'),('goals'),
 ('goal_periods'),('community_post_goals'),('groups'),('group_members'),('users'),
 ('user_blocks'),('content_reports')
)
SELECT e.table_name,c.oid IS NOT NULL AS table_exists,
       c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced,
       pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM expected e
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name
ORDER BY e.table_name;

-- Full current policy expressions/roles, including writes and ALL.
-- Multiple permissive SELECT/ALL policies OR together: names alone are insufficient.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND tablename IN (
 'workouts','movements','workout_definitions','workout_blocks','block_movements',
 'workout_sessions','workout_session_metrics','workout_session_segments',
 'session_movement_results','set_results','community_posts','community_post_comments',
 'community_post_reactions','personal_records','community_post_prs','goals',
 'goal_periods','community_post_goals','groups','group_members','users','user_blocks','content_reports'
)
ORDER BY tablename,cmd,policyname;

-- Exactly one expected authenticated permissive SELECT, no extra SELECT/ALL policy.
WITH expected(table_name,policy_name) AS (VALUES
 ('workouts','workouts_select_own_or_group'),
 ('movements','movements_select_catalog'),
 ('workout_definitions','workout_definitions_select_visible'),
 ('workout_blocks','workout_blocks_select_visible'),
 ('block_movements','block_movements_select_visible'),
 ('workout_sessions','workout_sessions_select_visible'),
 ('workout_session_metrics','workout_session_metrics_select_visible'),
 ('workout_session_segments','workout_session_segments_select_visible'),
 ('session_movement_results','session_movement_results_select_visible'),
 ('set_results','set_results_select_visible'),
 ('community_posts','community_posts_select_member'),
 ('community_post_comments','community_post_comments_select_member'),
 ('community_post_reactions','community_post_reactions_select_member'),
 ('personal_records','personal_records_select_own'),
 ('community_post_prs','community_post_prs_select_member'),
 ('goals','goals_select_own'),('goal_periods','goal_periods_select_own'),
 ('community_post_goals','community_post_goals_select_member'),
 ('groups','groups_select_member'),('group_members','group_members_select_roster'),
 ('users','users_select_self_or_group_peer'),('user_blocks','user_blocks_select_own'),
 ('content_reports','content_reports_select_own')
)
SELECT e.table_name,e.policy_name,count(p.oid) AS read_policy_count,
       count(p.oid)=1 AND coalesce(bool_and(
         p.polcmd='r' AND p.polname=e.policy_name AND p.polpermissive
         AND p.polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated')]
       ),false) AS exact_expected_read_policy_set
FROM expected e
LEFT JOIN pg_catalog.pg_policy p ON p.polrelid=pg_catalog.to_regclass('public.'||e.table_name)
 AND p.polcmd IN ('r','*')
GROUP BY e.table_name,e.policy_name ORDER BY e.table_name;

-- Changed policies: expected text beside actual. pg_get_expr adds parentheses/qualification.
-- Conservative whitespace-only match may be FALSE for formatting; manually review differences.
-- Do not strip operators/parentheses or automatically replace a production policy to make it match.
WITH expected(policy_name,expected_using) AS (VALUES
 ('workouts_select_own_or_group',$p$user_id = auth.uid() or exists (select 1 from public.community_posts as post where post.workout_session_id = workouts.id and post.group_id = workouts.group_id and post.user_id = workouts.user_id and private.can_access_community_post(post.id))$p$),
 ('community_posts_select_member',$p$user_id = auth.uid() or private.can_access_community_post(id)$p$),
 ('community_post_comments_select_member',$p$private.can_read_community_comment(id)$p$),
 ('community_post_reactions_select_member',$p$private.can_read_community_reaction(id)$p$),
 ('community_post_prs_select_member',$p$user_id = auth.uid() or (private.can_access_community_post(post_id) and not private.is_blocked_between(auth.uid(), user_id))$p$)
)
SELECT e.policy_name,e.expected_using,
       pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS actual_using,
       regexp_replace(e.expected_using,'\s+','','g')=
       regexp_replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'\s+','','g')
         AS whitespace_only_match_review_if_false
FROM expected e
LEFT JOIN pg_catalog.pg_policy p ON p.polname=e.policy_name
 AND p.polrelid IN (SELECT c.oid FROM pg_catalog.pg_class c
                   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
ORDER BY e.policy_name;

-- Exact prosrc hashes of reviewed proposed helper bodies in PLAN.md.
-- These are NOT migration tracking hashes. A mismatch requires full-definition review.
WITH expected(signature,expected_body_md5,client_execute_expected) AS (VALUES
 ('private.community_post_visible_to(uuid,uuid)','74af96698724eebf00b43009aa74216a',false),
 ('private.can_access_community_post(uuid)','e9445a7b7a5e453a9fe93d4c59fadcef',true),
 ('private.can_read_workout_session(uuid)','f2fc83de30e6910f86e368e38aafb695',true),
 ('private.can_read_workout_definition(uuid)','8e51f5b096b17ab1618d6f4fb8be58b8',true),
 ('private.community_comment_visible_to(uuid,uuid)','d5b03b870ea9fe59aef6866c9308c68b',false),
 ('private.community_reaction_visible_to(uuid,uuid)','e7896aadcd9cefdca02bc55f4179ad69',false),
 ('private.can_read_community_comment(uuid)','fe5d36582f39f898f770cf59776b8357',true),
 ('private.can_read_community_reaction(uuid)','f30761229b0ea9a52af92b12c2dac75d',true)
)
SELECT e.signature,p.oid IS NOT NULL AS function_exists,
       e.expected_body_md5,pg_catalog.md5(p.prosrc) AS actual_body_md5,
       pg_catalog.md5(p.prosrc)=e.expected_body_md5 AS exact_reviewed_body,
       p.prosecdef AS security_definer,p.provolatile='s' AS stable,p.proconfig,
       coalesce(p.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""'] AS empty_search_path,
       owner.rolname AS function_owner,owner.rolsuper OR owner.rolbypassrls AS owner_bypasses_force,
       e.client_execute_expected,
       CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
       CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute
FROM expected e
LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.signature)
LEFT JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
ORDER BY e.signature;

-- Full definitions/attributes of proposed AND inherited helpers; compare inherited with Appendix A.
-- owns_photo_path is intentionally invoker (storage); report_target_is_valid is ancillary writes.
SELECT p.oid::regprocedure AS signature,owner.rolname AS function_owner,
       owner.rolsuper,owner.rolbypassrls,p.prosecdef,p.provolatile,p.proconfig,
       pg_catalog.pg_get_functiondef(p.oid) AS full_definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
WHERE n.nspname='private' AND p.proname IN (
 'owns_workout_session','can_read_workout_session','owns_workout_definition',
 'can_read_workout_definition','owns_workout_block','can_read_workout_block',
 'owns_session_movement','can_read_session_movement','is_group_member','shares_group',
 'can_access_community_post','crew_content_visible','is_blocked_between','goal_badge_post_visible',
 'owns_photo_path','report_target_is_valid','community_post_visible_to','community_comment_visible_to',
 'community_reaction_visible_to','can_read_community_comment','can_read_community_reaction'
)
ORDER BY p.oid::regprocedure::text;

-- ALL function ACL grantees. PUBLIC must not execute the proposed predicates.
-- Explicit-viewer helpers: only function owner / verified privileged API role should execute.
-- JWT wrappers: authenticated plus their trusted owner. Detect unexpected default/custom grants.
SELECT p.oid::regprocedure AS signature,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
WHERE n.nspname='private'
ORDER BY p.oid::regprocedure::text,grantee;

-- Schema privileges and client role inheritance. Confirm real DATABASE_URL role separately;
-- inspecting role or function owner alone is not evidence of server deployment configuration.
SELECT r.rolname,
       pg_catalog.has_schema_privilege(r.oid,pg_catalog.to_regnamespace('private'),'USAGE') AS private_usage,
       r.rolsuper,r.rolbypassrls
FROM pg_catalog.pg_roles r
WHERE r.rolname IN ('anon','authenticated',current_user,'repin_api') ORDER BY r.rolname;
SELECT member.rolname AS member_role,parent.rolname AS granted_role,m.admin_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles member ON member.oid=m.member
JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
WHERE member.rolname IN ('anon','authenticated') ORDER BY member_role,granted_role;
SELECT r.rolname AS privileged_role,
       pg_catalog.pg_has_role('authenticated',r.oid,'MEMBER') AS authenticated_can_assume,
       pg_catalog.pg_has_role('anon',r.oid,'MEMBER') AS anon_can_assume
FROM pg_catalog.pg_roles r WHERE r.rolsuper OR r.rolbypassrls ORDER BY r.rolname;

-- Effective client table privileges. Anon: none. Authenticated caches/goals/periods/badges:
-- SELECT only. Authenticated owner-write workout tables keep existing CRUD, constrained by RLS.
SELECT t.table_name,r.role_name,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'SELECT') AS sel,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'INSERT') AS ins,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'UPDATE') AS upd,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'DELETE') AS del,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'TRUNCATE') AS trunc,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'REFERENCES') AS refs,
       pg_catalog.has_table_privilege(r.role_name,'public.'||t.table_name,'TRIGGER') AS trig
FROM (VALUES
 ('workouts'),('movements'),('workout_definitions'),('workout_blocks'),('block_movements'),
 ('workout_sessions'),('workout_session_metrics'),('workout_session_segments'),
 ('session_movement_results'),('set_results'),('community_posts'),('community_post_comments'),
 ('community_post_reactions'),('personal_records'),('community_post_prs'),('goals'),
 ('goal_periods'),('community_post_goals'),('groups'),('group_members'),('users'),
 ('user_blocks'),('content_reports')
) t(table_name) CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
WHERE pg_catalog.to_regclass('public.'||t.table_name) IS NOT NULL
ORDER BY t.table_name,r.role_name;

-- Raw table and COLUMN ACLs: table revokes do not necessarily remove column-level grants.
-- PUBLIC/unexpected grantees and any private-cache column writes must block rollout for review.
SELECT n.nspname,c.relname,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY c.relname,grantee,a.privilege_type;
SELECT n.nspname,c.relname,col.attname,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_attribute col
JOIN pg_catalog.pg_class c ON c.oid=col.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(col.attacl) a
WHERE n.nspname='public' AND col.attnum>0 AND NOT col.attisdropped
ORDER BY c.relname,col.attname,grantee;

-- Effective any-column privileges can reveal rights missed by table-level checks.
SELECT c.relname,r.role_name,
       pg_catalog.has_any_column_privilege(r.role_name,c.oid,'SELECT') AS any_select,
       pg_catalog.has_any_column_privilege(r.role_name,c.oid,'INSERT') AS any_insert,
       pg_catalog.has_any_column_privilege(r.role_name,c.oid,'UPDATE') AS any_update,
       pg_catalog.has_any_column_privilege(r.role_name,c.oid,'REFERENCES') AS any_references
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
WHERE n.nspname='public' AND c.relname IN (
 'personal_records','community_post_prs','goals','goal_periods','community_post_goals'
)
ORDER BY c.relname,r.role_name;

-- Relation existence only, to avoid unguarded queries to absent migration tracking tables.
SELECT pg_catalog.to_regclass('drizzle.__drizzle_migrations') AS drizzle_tracking,
       pg_catalog.to_regclass('supabase_migrations.schema_migrations') AS optional_supabase_tracking;
-- If drizzle_tracking exists, separately review:
-- SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC;
-- Compare actual applying-tool hash of 0020; never invent it or assume a Supabase journal exists.
ROLLBACK;

/* OPTIONAL ROLE SIMULATION. REVIEW BEFORE UNCOMMENTING.
   Use synthetic test users/sessions/posts only; replace all four UUIDs.
   The zero-prefixed UUIDs below are placeholders, not real identities.
   Only authorized privileged operators can SET ROLE. Never use claim simulation as client auth.
   Run owner and peer checks in separate transactions; all settings are LOCAL and ROLLBACK.
   Expected outcomes come from PLAN.md matrix. Counts avoid dumping workout health data.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT auth.uid() AS simulated_uid,
       private.can_read_workout_session('00000000-0000-0000-0000-000000000002') AS session_visible,
       private.can_access_community_post('00000000-0000-0000-0000-000000000003') AS social_post_visible;
SELECT count(*) AS visible_session_rows FROM public.workout_sessions
WHERE id='00000000-0000-0000-0000-000000000002';
SELECT count(*) AS visible_metric_rows FROM public.workout_session_metrics
WHERE workout_session_id='00000000-0000-0000-0000-000000000002';
SELECT count(*) AS visible_interval_rows FROM public.workout_session_segments
WHERE workout_session_id='00000000-0000-0000-0000-000000000002';
SELECT count(*) AS visible_movement_rows FROM public.session_movement_results
WHERE workout_session_id='00000000-0000-0000-0000-000000000002';
SELECT count(*) AS visible_set_rows FROM public.set_results sr
JOIN public.session_movement_results mr ON mr.id=sr.session_movement_result_id
WHERE mr.workout_session_id='00000000-0000-0000-0000-000000000002';
SELECT count(*) AS visible_post_rows FROM public.community_posts
WHERE id='00000000-0000-0000-0000-000000000003';
SELECT count(*) AS visible_pr_badges FROM public.community_post_prs
WHERE post_id='00000000-0000-0000-0000-000000000003';
SELECT count(*) AS visible_goal_badges FROM public.community_post_goals
WHERE post_id='00000000-0000-0000-0000-000000000003';
SELECT count(*) AS visible_foreign_definition FROM public.workout_definitions
WHERE id='00000000-0000-0000-0000-000000000004';
SELECT pg_catalog.has_function_privilege(current_user,
 'private.community_post_visible_to(uuid,uuid)','EXECUTE') AS must_be_false;
ROLLBACK;
*/
