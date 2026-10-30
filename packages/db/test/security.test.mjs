import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const dbPackageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceUrl = process.env.DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const appTables = [
  "block_movements",
  "community_post_comments",
  "community_post_reactions",
  "community_posts",
  "group_members",
  "groups",
  "movements",
  "session_movement_results",
  "set_results",
  "users",
  "workout_blocks",
  "workout_definitions",
  "workout_session_metrics",
  "workout_session_segments",
  "workout_sessions",
  "workouts",
];

const readOnlyTables = new Set([
  "users",
  "groups",
  "group_members",
  "movements",
]);

test("invite-only groups and row level security", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    await runDrizzleMigrate(testUrl);
    await applySupabaseMigrations(client);
    await createBypassRole(client);

    const db = await import("../src/index.ts");
    const ada = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Ada" });
    const adaAgain = await db.getOrCreateUser({ id: ada.id, displayName: "Someone else" });
    assert.equal(adaAgain.displayName, "Ada");
    const byron = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Byron" });
    const cyrus = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Cyrus" });

    const alpha = await db.createGroup({ ownerId: ada.id, name: "Alpha Crew" });
    const beta = await db.createGroup({ ownerId: ada.id, name: "Beta Crew" });
    assert.match(alpha.inviteCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(alpha.role, "owner");

    const posted = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: alpha.id,
      workoutType: "run",
      title: "Morning run",
      name: "Morning run",
      durationMinutes: 30,
      effort: 3,
      caption: "Felt good",
      photoPath: null,
      occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      metrics: [{ metricType: "distance", numericValue: 5, unit: "km" }],
      segments: [{ position: 0, segmentType: "work", durationSeconds: 60 }],
      movements: [{
        movementName: "Squat",
        notes: null,
        sets: [{ reps: 5, load: 60, loadUnit: "kg" }],
      }],
    });
    assert.ok(posted);
    assert.equal(posted.caption, "Felt good");

    const adaComment = await db.createCommunityPostCommentForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: alpha.id,
      workoutSessionId: posted.id,
      text: "Easy pace",
    });
    assert.equal(adaComment?.text, "Easy pace");
    const adaReaction = await db.setCommunityPostReactionForMember({
      userId: ada.id,
      groupId: alpha.id,
      workoutSessionId: posted.id,
      reactionType: "fire",
    });
    assert.equal(adaReaction?.counts.fire, 1);

    assert.equal(
      await db.createCommunityPostCommentForMember({
        userId: byron.id,
        displayName: byron.displayName,
        groupId: alpha.id,
        workoutSessionId: posted.id,
        text: "I am not in this group",
      }),
      null,
    );
    assert.equal(
      await db.joinGroup({
        userId: byron.id,
        groupId: alpha.id,
        inviteCode: "WRONGCOD",
      }),
      null,
    );
    assert.equal(
      await db.joinGroupByInviteCode({ userId: byron.id, inviteCode: "NOPE2345" }),
      null,
    );

    const hiddenSearch = await db.searchGroupsForUser({ userId: byron.id, query: "Alpha" });
    assert.deepEqual(hiddenSearch, []);
    const outsiderView = await db.getGroupForMember({ groupId: alpha.id, userId: byron.id });
    assert.equal(outsiderView, null);
    assert.equal(
      await db.listRecentWorkoutsForMember({ userId: byron.id, groupId: alpha.id }),
      null,
    );

    const invitePage = await db.getPublicGroupInviteByCode(alpha.inviteCode);
    assert.deepEqual(invitePage, { name: "Alpha Crew", inviteCode: alpha.inviteCode });
    assert.equal("id" in (invitePage ?? {}), false);

    const joined = await db.joinGroupByInviteCode({
      userId: byron.id,
      inviteCode: invitePage.inviteCode.toLowerCase(),
    });
    assert.equal(joined?.alreadyMember, false);
    assert.equal(joined?.membership.role, "member");
    assert.equal(joined?.group.name, "Alpha Crew");
    const joinedAgain = await db.joinGroup({
      userId: byron.id,
      groupId: alpha.id,
      inviteCode: alpha.inviteCode,
    });
    assert.equal(joinedAgain?.alreadyMember, true);

    const memberView = await db.getGroupForMember({ groupId: alpha.id, userId: byron.id });
    assert.equal(memberView?.inviteCode, alpha.inviteCode);
    const memberSearch = await db.searchGroupsForUser({ userId: byron.id, query: "Alpha" });
    assert.equal(memberSearch.length, 1);
    assert.equal(memberSearch[0]?.id, alpha.id);
    assert.equal("inviteCode" in memberSearch[0], false);
    assert.deepEqual(
      await db.searchGroupsForUser({ userId: cyrus.id, query: "Alpha" }),
      [],
    );
    const feed = await db.listRecentWorkoutsForMember({
      userId: byron.id,
      groupId: alpha.id,
    });
    assert.equal(feed?.length, 1);
    assert.equal(feed[0]?.displayName, "Ada");
    const byronComment = await db.createCommunityPostCommentForMember({
      userId: byron.id,
      displayName: byron.displayName,
      groupId: alpha.id,
      workoutSessionId: posted.id,
      text: "Nice work",
    });
    assert.equal(byronComment?.text, "Nice work");
    const byronReaction = await db.setCommunityPostReactionForMember({
      userId: byron.id,
      groupId: alpha.id,
      workoutSessionId: posted.id,
      reactionType: "clap",
    });
    assert.equal(byronReaction?.counts.fire, 1);
    assert.equal(byronReaction?.counts.clap, 1);
    assert.equal(
      await db.updateWorkoutForOwner({
        userId: byron.id,
        groupId: alpha.id,
        workoutSessionId: posted.id,
        workoutType: "run",
        name: "Stolen",
        durationMinutes: 1,
        effort: 1,
        caption: "Stolen",
        photoPath: null,
        occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      }),
      null,
    );
    assert.equal(
      await db.deleteCommunityPostForOwner({
        userId: byron.id,
        groupId: alpha.id,
        workoutSessionId: posted.id,
        deleteWorkout: true,
      }),
      null,
    );
    const edited = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: alpha.id,
      workoutSessionId: posted.id,
      workoutType: "run",
      name: "Morning run",
      durationMinutes: 32,
      effort: 4,
      caption: "Felt strong",
      photoPath: null,
      occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      metrics: [{ metricType: "distance", numericValue: 6, unit: "km" }],
      movements: [{
        movementName: "Squat",
        sets: [{ reps: 5, load: 60, loadUnit: "kg" }],
      }],
    });
    assert.ok(edited);

    const [{ post_id: postId }] = (await client.query(
      "select id as post_id from community_posts where workout_session_id = $1",
      [posted.id],
    )).rows;
    const privateSessionId = crypto.randomUUID();
    const definitionId = crypto.randomUUID();
    const blockId = crypto.randomUUID();
    await client.query(
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values ($1, $2, 'run', 'Private', now())`,
      [privateSessionId, ada.id],
    );
    await client.query(
      `insert into workout_definitions (id, created_by_user_id, title, source_type)
       values ($1, $2, 'Plan', 'manual')`,
      [definitionId, ada.id],
    );
    await client.query(
      `insert into workout_blocks (id, workout_definition_id, position, type)
       values ($1, $2, 0, 'straight_sets')`,
      [blockId, definitionId],
    );
    await client.query(
      `insert into block_movements (workout_block_id, movement_name, position)
       values ($1, 'Squat', 0)`,
      [blockId],
    );
    await client.query(
      "update workout_sessions set workout_definition_id = $1 where id = $2",
      [definitionId, posted.id],
    );
    await client.query(
      `insert into workouts (
         user_id, group_id, workout_type, title, occurred_at, completed_at
       ) values ($1, $2, 'run', 'Legacy', now(), now())`,
      [ada.id, alpha.id],
    );
    await client.query(
      "insert into movements (name, slug) values ('Back Squat', 'back-squat')",
    );

    await expectDenied(
      client,
      "anon",
      null,
      "select id from users",
      [],
      /permission denied/i,
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      "insert into group_members (group_id, user_id, role) values ($1, $2, 'member')",
      [beta.id, byron.id],
      /permission denied/i,
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      "insert into movements (name, slug) values ('Hack', 'hack')",
      [],
      /permission denied/i,
    );

    await client.query("begin");
    try {
      await client.query("grant insert, update, delete on public.group_members to authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: byron.id, role: "authenticated" }),
      ]);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [byron.id]);
      await client.query("set local role authenticated");
      await assert.rejects(
        () => client.query(
          "insert into group_members (group_id, user_id, role) values ($1, $2, 'owner')",
          [beta.id, byron.id],
        ),
        (error) => {
          assert.equal(error.code, "42501");
          assert.match(error.message, /row-level security/i);
          return true;
        },
      );
    } finally {
      await client.query("rollback");
    }

    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select public.join_group_by_invite_code($1)",
        ["not-a-code"],
      ),
      null,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select public.join_group_by_invite_code($1)",
        ["ZZZZZZZZ"],
      ),
      null,
    );
    await expectDenied(
      client,
      "anon",
      null,
      "select public.join_group_by_invite_code($1)",
      [beta.inviteCode],
      /not authenticated|permission denied/i,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        ada.id,
        "select public.join_group_by_invite_code($1)",
        [alpha.inviteCode],
      ),
      alpha.id,
    );
    assert.equal(
      await scalar(
        client,
        "postgres",
        null,
        "select role from group_members where group_id = $1 and user_id = $2",
        [alpha.id, ada.id],
      ),
      "owner",
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select public.join_group_by_invite_code($1)",
        [beta.inviteCode],
      ),
      beta.id,
    );
    assert.equal(
      await scalar(
        client,
        "postgres",
        null,
        "select role from group_members where group_id = $1 and user_id = $2",
        [beta.id, byron.id],
      ),
      "member",
    );

    assert.deepEqual(
      await idsAs(client, "authenticated", cyrus.id, "select id from groups"),
      [],
    );
    assert.deepEqual(
      await idsAs(
        client,
        "authenticated",
        cyrus.id,
        "select id from groups where invite_code = $1",
        [alpha.inviteCode],
      ),
      [],
    );
    assert.deepEqual(
      await idsAs(
        client,
        "authenticated",
        cyrus.id,
        "select id from users where id = $1",
        [ada.id],
      ),
      [],
    );
    assert.deepEqual(
      await idsAs(
        client,
        "authenticated",
        byron.id,
        "select id from workout_sessions where id = $1",
        [privateSessionId],
      ),
      [],
    );
    assert.deepEqual(
      await idsAs(
        client,
        "authenticated",
        cyrus.id,
        "select id from community_posts where id = $1",
        [postId],
      ),
      [],
    );
    assert.ok(
      (await idsAs(client, "authenticated", byron.id, "select id from users where id = $1", [ada.id]))
        .includes(ada.id),
    );
    assert.ok(
      (await idsAs(client, "authenticated", byron.id, "select id from groups where id = $1", [alpha.id]))
        .includes(alpha.id),
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select invite_code from groups where id = $1",
        [alpha.id],
      ),
      alpha.inviteCode,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select caption from community_posts where id = $1",
        [postId],
      ),
      "Felt strong",
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        cyrus.id,
        "select count(*)::int from workout_session_metrics where workout_session_id = $1",
        [posted.id],
      ),
      0,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select count(*)::int from workout_session_metrics where workout_session_id = $1",
        [posted.id],
      ),
      1,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select count(*)::int from set_results",
        [],
      ),
      1,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        cyrus.id,
        "select count(*)::int from set_results",
        [],
      ),
      0,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select title from workout_definitions where id = $1",
        [definitionId],
      ),
      "Plan",
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        cyrus.id,
        "select count(*)::int from workout_blocks where id = $1",
        [blockId],
      ),
      0,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        byron.id,
        "select count(*)::int from workouts where group_id = $1",
        [alpha.id],
      ),
      1,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        cyrus.id,
        "select count(*)::int from workouts where group_id = $1",
        [alpha.id],
      ),
      0,
    );
    assert.equal(
      await scalar(
        client,
        "authenticated",
        ada.id,
        "select name from movements where slug = 'back-squat'",
        [],
      ),
      "Back Squat",
    );

    const captionUpdate = await queryAs(
      client,
      "authenticated",
      byron.id,
      "update community_posts set caption = 'hacked' where id = $1",
      [postId],
    );
    assert.equal(captionUpdate.rowCount, 0);
    const commentDelete = await queryAs(
      client,
      "authenticated",
      ada.id,
      "delete from community_post_comments where user_id = $1",
      [byron.id],
    );
    assert.equal(commentDelete.rowCount, 0);
    const reactionUpdate = await queryAs(
      client,
      "authenticated",
      byron.id,
      "update community_post_reactions set reaction_type = 'strong' where user_id = $1",
      [ada.id],
    );
    assert.equal(reactionUpdate.rowCount, 0);
    const definitionUpdate = await queryAs(
      client,
      "authenticated",
      byron.id,
      "update workout_definitions set title = 'hacked' where id = $1",
      [definitionId],
    );
    assert.equal(definitionUpdate.rowCount, 0);
    assert.equal(
      await scalar(client, "postgres", null, "select caption from community_posts where id = $1", [postId]),
      "Felt strong",
    );
    assert.equal(
      await scalar(
        client,
        "postgres",
        null,
        "select text from community_post_comments where user_id = $1",
        [byron.id],
      ),
      "Nice work",
    );
    assert.equal(
      await scalar(
        client,
        "postgres",
        null,
        "select reaction_type from community_post_reactions where user_id = $1",
        [ada.id],
      ),
      "fire",
    );

    const byronSessionId = crypto.randomUUID();
    await queryAs(
      client,
      "authenticated",
      byron.id,
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values ($1, $2, 'run', 'Byron run', now())`,
      [byronSessionId, byron.id],
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      `insert into community_posts (user_id, group_id, workout_session_id, photo_path)
       values ($1, $2, $3, $4)`,
      [byron.id, alpha.id, byronSessionId, `${ada.id}/secret.jpg`],
      /row-level security/i,
    );
    await queryAs(
      client,
      "authenticated",
      byron.id,
      `insert into community_posts (user_id, group_id, workout_session_id, caption, photo_path)
       values ($1, $2, $3, 'Joined', $4)`,
      [byron.id, alpha.id, byronSessionId, `${byron.id}/ok.jpg`],
    );
    await expectDenied(
      client,
      "authenticated",
      cyrus.id,
      `insert into community_posts (user_id, group_id, workout_session_id)
       values ($1, $2, $3)`,
      [cyrus.id, alpha.id, byronSessionId],
      /row-level security/i,
    );

    const adaPhoto = `${ada.id}/photo.jpg`;
    await queryAs(
      client,
      "authenticated",
      ada.id,
      "insert into storage.objects (bucket_id, name) values ('workout-photos', $1)",
      [adaPhoto],
    );
    assert.deepEqual(
      await columnAs(
        client,
        "authenticated",
        byron.id,
        "select name from storage.objects where bucket_id = 'workout-photos'",
        [],
        "name",
      ),
      [],
    );
    assert.deepEqual(
      await columnAs(
        client,
        "authenticated",
        ada.id,
        "select name from storage.objects where bucket_id = 'workout-photos'",
        [],
        "name",
      ),
      [adaPhoto],
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      "insert into storage.objects (bucket_id, name) values ('workout-photos', $1)",
      [`${ada.id}/stolen.jpg`],
      /row-level security/i,
    );
    await queryAs(
      client,
      "authenticated",
      byron.id,
      "insert into storage.objects (bucket_id, name) values ('workout-photos', $1)",
      [`${byron.id}/photo.jpg`],
    );
    const stolenDelete = await queryAs(
      client,
      "authenticated",
      byron.id,
      "delete from storage.objects where name = $1",
      [adaPhoto],
    );
    assert.equal(stolenDelete.rowCount, 0);
    assert.deepEqual(
      await columnAs(
        client,
        "anon",
        null,
        "select name from storage.objects",
        [],
        "name",
      ),
      [],
    );
    await expectDenied(
      client,
      "anon",
      null,
      "insert into storage.objects (bucket_id, name) values ('workout-photos', 'anon/photo.jpg')",
      [],
      /row-level security/i,
    );
    assert.equal(
      await scalar(
        client,
        "postgres",
        null,
        "select public from storage.buckets where id = 'workout-photos'",
        [],
      ),
      false,
    );

    const visibleToBypass = await scalar(
      client,
      "repin_api",
      null,
      "select count(*)::int from users",
      [],
    );
    const visibleToSuperuser = await scalar(
      client,
      "postgres",
      null,
      "select count(*)::int from users",
      [],
    );
    assert.equal(visibleToBypass, visibleToSuperuser);
    assert.ok(visibleToBypass >= 3);

    const protection = await client.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);
    assert.deepEqual(
      protection.rows.map((row) => row.relname),
      appTables,
    );
    assert.ok(protection.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));

    const policies = await client.query(`
      select tablename, cmd, roles
      from pg_policies
      where schemaname = 'public'
      order by tablename, cmd
    `);
    const byTable = new Map();
    for (const policy of policies.rows) {
      assert.deepEqual(normalizeRoles(policy.roles), ["authenticated"]);
      const commands = byTable.get(policy.tablename) ?? [];
      commands.push(policy.cmd);
      byTable.set(policy.tablename, commands);
    }
    for (const table of appTables) {
      const commands = byTable.get(table) ?? [];
      assert.deepEqual(
        commands,
        readOnlyTables.has(table)
          ? ["SELECT"]
          : ["DELETE", "INSERT", "SELECT", "UPDATE"],
        table,
      );
    }

    const anonGrants = await client.query(`
      select table_name
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
    `);
    assert.deepEqual(anonGrants.rows, []);

    const privileges = await client.query(`
      select
        has_function_privilege('anon', 'public.join_group_by_invite_code(text)', 'execute') as anon_join,
        has_function_privilege('authenticated', 'public.join_group_by_invite_code(text)', 'execute') as user_join,
        has_function_privilege('anon', 'private.is_group_member(uuid)', 'execute') as anon_helper,
        has_function_privilege('authenticated', 'private.is_group_member(uuid)', 'execute') as user_helper
    `);
    assert.equal(privileges.rows[0].anon_join, false);
    assert.equal(privileges.rows[0].user_join, true);
    assert.equal(privileges.rows[0].anon_helper, false);
    assert.equal(privileges.rows[0].user_helper, true);

    await assertStorageBlockToleratesNonOwner(client);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

test("account deletion transfers ownership and deletes an empty group", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    await runDrizzleMigrate(testUrl);
    await applySupabaseMigrations(client);
    await createBypassRole(client);
    const db = await import("../src/index.ts");

    const ownerId = "10000000-0000-4000-8000-000000000001";
    const earlyId = "10000000-0000-4000-8000-000000000002";
    const lateId = "10000000-0000-4000-8000-000000000003";
    const tieOwnerId = "20000000-0000-4000-8000-0000000000aa";
    const tieLowId = "20000000-0000-4000-8000-000000000001";
    const tieHighId = "20000000-0000-4000-8000-000000000002";
    const soleId = "30000000-0000-4000-8000-000000000001";
    const formerId = "30000000-0000-4000-8000-000000000002";
    const bareId = "40000000-0000-4000-8000-000000000001";

    const missing = await db.deleteUserAccount(crypto.randomUUID());
    assert.deepEqual(missing, {
      deletedUser: false,
      deletedGroupIds: [],
      transferredGroups: [],
    });

    const owner = await db.getOrCreateUser({ id: ownerId, displayName: "Owner" });
    const early = await db.getOrCreateUser({ id: earlyId, displayName: "Early" });
    const late = await db.getOrCreateUser({ id: lateId, displayName: "Late" });
    const tieOwner = await db.getOrCreateUser({ id: tieOwnerId, displayName: "Tie Owner" });
    const tieLow = await db.getOrCreateUser({ id: tieLowId, displayName: "Tie Low" });
    const tieHigh = await db.getOrCreateUser({ id: tieHighId, displayName: "Tie High" });
    const sole = await db.getOrCreateUser({ id: soleId, displayName: "Sole" });
    const former = await db.getOrCreateUser({ id: formerId, displayName: "Former" });
    const bare = await db.getOrCreateUser({ id: bareId, displayName: "Bare" });
    await db.createMovement({ name: "Back Squat", slug: "back-squat" });

    const shared = await db.createGroup({ ownerId: owner.id, name: "Shared Crew" });
    await db.joinGroup({ userId: early.id, groupId: shared.id, inviteCode: shared.inviteCode });
    await db.joinGroup({ userId: late.id, groupId: shared.id, inviteCode: shared.inviteCode });
    await client.query(
      "update group_members set joined_at = $1 where group_id = $2 and user_id = $3",
      ["2019-01-01T00:00:00.000Z", shared.id, early.id],
    );
    await client.query(
      "update group_members set joined_at = $1 where group_id = $2 and user_id = $3",
      ["2024-06-01T00:00:00.000Z", shared.id, late.id],
    );
    await client.query(
      "update group_members set joined_at = $1 where group_id = $2 and user_id = $3",
      ["2021-01-01T00:00:00.000Z", shared.id, owner.id],
    );

    const ownerPost = await loggedWorkout(db, owner, shared.id, "Owner workout");
    const earlyPost = await loggedWorkout(db, early, shared.id, "Early workout");
    const latePost = await loggedWorkout(db, late, shared.id, "Late workout");
    assert.ok(ownerPost && earlyPost && latePost);
    await client.query(
      "update community_posts set photo_path = $1 where workout_session_id = $2",
      [`${owner.id}/photo.jpg`, ownerPost.id],
    );
    await db.createCommunityPostCommentForMember({
      userId: owner.id,
      displayName: owner.displayName,
      groupId: shared.id,
      workoutSessionId: earlyPost.id,
      text: "Owner note",
    });
    await db.createCommunityPostCommentForMember({
      userId: early.id,
      displayName: early.displayName,
      groupId: shared.id,
      workoutSessionId: ownerPost.id,
      text: "On owner",
    });
    await db.createCommunityPostCommentForMember({
      userId: early.id,
      displayName: early.displayName,
      groupId: shared.id,
      workoutSessionId: earlyPost.id,
      text: "On mine",
    });
    await db.setCommunityPostReactionForMember({
      userId: owner.id,
      groupId: shared.id,
      workoutSessionId: earlyPost.id,
      reactionType: "fire",
    });
    await db.setCommunityPostReactionForMember({
      userId: early.id,
      groupId: shared.id,
      workoutSessionId: earlyPost.id,
      reactionType: "clap",
    });

    const ownerDefinition = await db.createWorkoutDefinition({
      createdByUserId: owner.id,
      title: "Owner plan",
      sourceType: "manual",
      blocks: [{
        position: 0,
        type: "straight_sets",
        movements: [{ movementName: "Squat", position: 0 }],
      }],
    });
    const earlyDefinition = await db.createWorkoutDefinition({
      createdByUserId: early.id,
      title: "Early plan",
      sourceType: "manual",
      blocks: [],
    });
    const blockMovementId = ownerDefinition.blocks[0]?.movements[0]?.id;
    assert.ok(blockMovementId);
    await client.query(
      "update workout_sessions set workout_definition_id = $1 where id = $2",
      [ownerDefinition.id, earlyPost.id],
    );
    const linked = await client.query(
      "update session_movement_results set block_movement_id = $1 where workout_session_id = $2",
      [blockMovementId, earlyPost.id],
    );
    assert.equal(linked.rowCount, 1);
    await client.query(
      `insert into workouts (user_id, group_id, workout_type, title, occurred_at, completed_at)
       values ($1, $2, 'run', 'Owner legacy', now(), now()),
              ($3, $2, 'run', 'Early legacy', now(), now())`,
      [owner.id, shared.id, early.id],
    );

    const tie = await db.createGroup({ ownerId: tieOwner.id, name: "Tie Crew" });
    await db.joinGroup({ userId: tieHigh.id, groupId: tie.id, inviteCode: tie.inviteCode });
    await db.joinGroup({ userId: tieLow.id, groupId: tie.id, inviteCode: tie.inviteCode });
    await client.query(
      "update group_members set joined_at = $1 where group_id = $2 and user_id = any($3::uuid[])",
      ["2020-01-01T00:00:00.000Z", tie.id, [tieLow.id, tieHigh.id]],
    );

    const empty = await db.createGroup({ ownerId: sole.id, name: "Empty Crew" });
    await db.joinGroup({ userId: former.id, groupId: empty.id, inviteCode: empty.inviteCode });
    const formerPost = await loggedWorkout(db, former, empty.id, "Former workout");
    assert.ok(formerPost);
    await client.query(
      "delete from group_members where group_id = $1 and user_id = $2",
      [empty.id, former.id],
    );
    const solePost = await loggedWorkout(db, sole, empty.id, "Sole workout");
    assert.ok(solePost);
    await client.query(
      `insert into workouts (user_id, group_id, workout_type, title, occurred_at, completed_at)
       values ($1, $2, 'run', 'Former legacy', now(), now()),
              ($3, $2, 'run', 'Sole legacy', now(), now())`,
      [former.id, empty.id, sole.id],
    );

    const removedLate = await db.deleteUserAccount(late.id);
    assert.deepEqual(removedLate, {
      deletedUser: true,
      deletedGroupIds: [],
      transferredGroups: [],
    });
    assert.equal(await countRows(client, "users", "id = $1", [late.id]), 0);
    assert.equal(await countRows(client, "community_posts", "workout_session_id = $1", [latePost.id]), 0);
    assert.equal(await countRows(client, "workout_sessions", "id = $1", [latePost.id]), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select owner_id from groups where id = $1", [shared.id]),
      owner.id,
    );
    assert.equal(
      await scalar(client, "postgres", null, "select caption from community_posts where workout_session_id = $1", [earlyPost.id]),
      "Early workout",
    );
    assert.equal(
      await scalar(client, "postgres", null, "select invite_code from groups where id = $1", [shared.id]),
      shared.inviteCode,
    );

    const removedOwner = await db.deleteUserAccount(owner.id);
    assert.equal(removedOwner.deletedUser, true);
    assert.deepEqual(removedOwner.deletedGroupIds, []);
    assert.deepEqual(removedOwner.transferredGroups, [{
      groupId: shared.id,
      newOwnerId: early.id,
    }]);
    assert.equal(await countRows(client, "users", "id = $1", [owner.id]), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select owner_id from groups where id = $1", [shared.id]),
      early.id,
    );
    assert.equal(
      await scalar(client, "postgres", null, "select role from group_members where group_id = $1 and user_id = $2", [shared.id, early.id]),
      "owner",
    );
    assert.equal(await countRows(client, "group_members", "group_id = $1 and user_id = $2", [shared.id, owner.id]), 0);
    assert.equal(await countRows(client, "group_members", "group_id = $1 and role = 'owner'", [shared.id]), 1);
    assert.equal(
      await scalar(client, "postgres", null, "select invite_code from groups where id = $1", [shared.id]),
      shared.inviteCode,
    );
    assert.deepEqual(await db.getPublicGroupInviteByCode(shared.inviteCode), {
      name: "Shared Crew",
      inviteCode: shared.inviteCode,
    });
    assert.equal(await countRows(client, "community_posts", "workout_session_id = $1", [ownerPost.id]), 0);
    assert.equal(await countRows(client, "workout_sessions", "id = $1", [ownerPost.id]), 0);
    assert.equal(await countRows(client, "workout_session_metrics", "workout_session_id = $1", [ownerPost.id]), 0);
    assert.equal(await countRows(client, "workout_session_segments", "workout_session_id = $1", [ownerPost.id]), 0);
    assert.equal(await countRows(client, "set_results", "session_movement_result_id in (select id from session_movement_results where workout_session_id = $1)", [ownerPost.id]), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select caption from community_posts where workout_session_id = $1", [earlyPost.id]),
      "Early workout",
    );
    assert.equal(await countRows(client, "workout_sessions", "id = $1", [earlyPost.id]), 1);
    assert.equal(await countRows(client, "workout_session_metrics", "workout_session_id = $1", [earlyPost.id]), 1);
    assert.equal(await countRows(client, "set_results", "session_movement_result_id in (select id from session_movement_results where workout_session_id = $1)", [earlyPost.id]), 1);
    assert.equal(await countRows(client, "community_post_comments", "text = 'Owner note'"), 0);
    assert.equal(await countRows(client, "community_post_comments", "text = 'On owner'"), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select text from community_post_comments where text = 'On mine'"),
      "On mine",
    );
    assert.equal(await countRows(client, "community_post_reactions", "user_id = $1", [owner.id]), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select reaction_type from community_post_reactions where user_id = $1", [early.id]),
      "clap",
    );
    assert.equal(await countRows(client, "workout_definitions", "id = $1", [ownerDefinition.id]), 0);
    assert.equal(await countRows(client, "workout_blocks", "workout_definition_id = $1", [ownerDefinition.id]), 0);
    assert.equal(await countRows(client, "block_movements", "id = $1", [blockMovementId]), 0);
    assert.equal(
      await scalar(client, "postgres", null, "select workout_definition_id from workout_sessions where id = $1", [earlyPost.id]),
      null,
    );
    assert.equal(
      await scalar(client, "postgres", null, "select block_movement_id from session_movement_results where workout_session_id = $1", [earlyPost.id]),
      null,
    );
    assert.equal(
      await scalar(client, "postgres", null, "select title from workout_definitions where id = $1", [earlyDefinition.id]),
      "Early plan",
    );
    assert.equal(await countRows(client, "workouts", "user_id = $1", [owner.id]), 0);
    assert.equal(await countRows(client, "workouts", "user_id = $1 and group_id = $2", [early.id, shared.id]), 1);
    assert.equal(
      await scalar(client, "postgres", null, "select name from movements where slug = 'back-squat'"),
      "Back Squat",
    );

    const removedTieOwner = await db.deleteUserAccount(tieOwner.id);
    assert.deepEqual(removedTieOwner.transferredGroups, [{
      groupId: tie.id,
      newOwnerId: tieLow.id,
    }]);
    assert.equal(
      await scalar(client, "postgres", null, "select owner_id from groups where id = $1", [tie.id]),
      tieLow.id,
    );
    assert.equal(
      await scalar(client, "postgres", null, "select role from group_members where group_id = $1 and user_id = $2", [tie.id, tieHigh.id]),
      "member",
    );
    const tieInvite = await db.getPublicGroupInviteByCode(tie.inviteCode);
    assert.equal(tieInvite?.inviteCode, tie.inviteCode);

    const removedSole = await db.deleteUserAccount(sole.id);
    assert.equal(removedSole.deletedUser, true);
    assert.deepEqual(removedSole.deletedGroupIds, [empty.id]);
    assert.deepEqual(removedSole.transferredGroups, []);
    assert.equal(await countRows(client, "groups", "id = $1", [empty.id]), 0);
    assert.equal(await countRows(client, "users", "id = $1", [sole.id]), 0);
    assert.equal(await db.getPublicGroupInviteByCode(empty.inviteCode), null);
    assert.equal(await countRows(client, "community_posts", "group_id = $1", [empty.id]), 0);
    assert.equal(await countRows(client, "community_posts", "workout_session_id = $1", [formerPost.id]), 0);
    assert.equal(await countRows(client, "workouts", "group_id = $1", [empty.id]), 0);
    assert.equal(await countRows(client, "workouts", "user_id = $1", [former.id]), 0);
    assert.equal(await countRows(client, "workout_sessions", "id = $1", [formerPost.id]), 1);
    assert.equal(await countRows(client, "workout_session_metrics", "workout_session_id = $1", [formerPost.id]), 1);
    assert.equal(await countRows(client, "users", "id = $1", [former.id]), 1);
    assert.equal(await countRows(client, "group_members", "user_id = $1", [former.id]), 0);

    const removedBare = await db.deleteUserAccount(bare.id);
    assert.deepEqual(removedBare, {
      deletedUser: true,
      deletedGroupIds: [],
      transferredGroups: [],
    });
    assert.deepEqual(await db.deleteUserAccount(owner.id), {
      deletedUser: false,
      deletedGroupIds: [],
      transferredGroups: [],
    });
    assert.deepEqual(await db.deleteUserAccount(sole.id), {
      deletedUser: false,
      deletedGroupIds: [],
      transferredGroups: [],
    });
    assert.equal(await countRows(client, "users", "id = $1", [early.id]), 1);
    assert.equal(await countRows(client, "users", "id = $1", [tieLow.id]), 1);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function loggedWorkout(db, user, groupId, title) {
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "run",
    title,
    name: title,
    durationMinutes: 20,
    effort: 3,
    caption: title,
    photoPath: null,
    occurredAt: new Date("2026-10-01T12:00:00.000Z"),
    metrics: [{ metricType: "distance", numericValue: 3, unit: "km" }],
    segments: [{ position: 0, segmentType: "work", durationSeconds: 60 }],
    movements: [{
      movementName: "Squat",
      notes: null,
      sets: [{ reps: 5, load: 40, loadUnit: "kg" }],
    }],
  });
}

async function countRows(client, table, where, params) {
  return scalar(
    client,
    "postgres",
    null,
    `select count(*)::int from ${table} where ${where}`,
    params,
  );
}

async function recreateDatabase() {
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_security_test with (force)");
    await admin.query("create database repin_security_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_security_test");
}

function withDatabase(connectionString, database) {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function prepareDatabase(client) {
  await client.query("create extension if not exists pgcrypto");
  await createRole(client, "anon");
  await createRole(client, "authenticated");
  await client.query(`
    create schema if not exists auth;
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await client.query(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      created_at timestamptz not null default now()
    );
    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select case
        when name is null or position('/' in name) = 0 then array[]::text[]
        else (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
      end
    $$;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    -- Hosted Supabase already enables RLS on storage.objects. This migration
    -- does not, so the harness has to match that default.
    alter table storage.objects enable row level security;
  `);
}

async function runDrizzleMigrate(databaseUrl) {
  await run(path.join(dbPackageRoot, "node_modules/.bin/drizzle-kit"), ["migrate"], {
    cwd: dbPackageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function applySupabaseMigrations(client) {
  const directory = path.join(repoRoot, "supabase/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  assert.deepEqual(files, [
    "20260822000000_workout_photos.sql",
    "20261030140000_enable_row_level_security.sql",
  ]);
  for (const file of files) {
    const sql = await readFile(path.join(directory, file), "utf8");
    await client.query(sql);
  }
}

async function createBypassRole(client) {
  const existing = await client.query("select 1 from pg_roles where rolname = 'repin_api'");
  if (existing.rowCount === 0) {
    await client.query("create role repin_api nologin bypassrls");
  }
  await client.query(`
    grant usage on schema public to repin_api;
    grant select, insert, update, delete on all tables in schema public to repin_api;
  `);
}

async function createRole(client, name) {
  const existing = await client.query("select 1 from pg_roles where rolname = $1", [name]);
  if (existing.rowCount === 0) {
    await client.query(`create role ${name} nologin noinherit`);
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function queryAs(client, role, userId, text, params = []) {
  return asRole(client, role, userId, () => client.query(text, params));
}

async function scalar(client, role, userId, text, params = []) {
  const result = await queryAs(client, role, userId, text, params);
  const [row] = result.rows;
  if (!row) return undefined;
  return row[Object.keys(row)[0]];
}

async function idsAs(client, role, userId, text, params = []) {
  return columnAs(client, role, userId, text, params, "id");
}

async function columnAs(client, role, userId, text, params, column) {
  const result = await queryAs(client, role, userId, text, params);
  return result.rows.map((row) => row[column]);
}

async function expectDenied(client, role, userId, text, params, pattern) {
  await assert.rejects(
    () => queryAs(client, role, userId, text, params),
    (error) => {
      assert.equal(error.code, "42501", error.message);
      assert.match(error.message, pattern);
      return true;
    },
  );
}

async function asRole(client, role, userId, fn) {
  if (role === "postgres") return fn();

  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    await client.query(`set local role ${role}`);
    const value = await fn();
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

const storagePolicyNames = [
  "Workout photo owners can read",
  "Workout photo owners can upload",
  "Workout photo owners can update",
  "Workout photo owners can delete",
];

async function assertStorageBlockToleratesNonOwner(client) {
  await createRole(client, "storage_table_owner");
  await createRole(client, "hosted_sql_editor");
  await client.query(`
    alter role hosted_sql_editor nosuperuser nobypassrls noinherit nologin;
    drop policy if exists "Workout photo owners can read" on storage.objects;
    drop policy if exists "Workout photo owners can upload" on storage.objects;
    drop policy if exists "Workout photo owners can update" on storage.objects;
    drop policy if exists "Workout photo owners can delete" on storage.objects;
    update storage.buckets set public = true where id = 'workout-photos';
    alter table storage.objects owner to storage_table_owner;
    alter table storage.buckets owner to storage_table_owner;
    grant usage on schema storage to hosted_sql_editor;
    grant select, insert, update, delete on storage.objects to hosted_sql_editor;
  `);

  const owner = await client.query(`
    select pg_get_userbyid(c.relowner) as owner
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
  `);
  assert.equal(owner.rows[0].owner, "storage_table_owner");

  const block = await storageMigrationBlock();
  await client.query("set role hosted_sql_editor");
  let notices;
  try {
    notices = await queryNotices(client, block);
  } finally {
    await client.query("reset role");
  }

  for (const name of storagePolicyNames) {
    assert.ok(
      notices.some((message) =>
        message.includes(`Could not create policy "${name}"`)
        && message.includes("Storage > Policies")
        && message.includes("20260822000000_workout_photos.sql"),
      ),
      notices.join("\n"),
    );
  }
  assert.ok(
    notices.some((message) =>
      message.includes("Could not update storage.buckets")
      && message.includes("20260822000000_workout_photos.sql"),
    ),
    notices.join("\n"),
  );

  const policies = await client.query(`
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname
  `);
  assert.deepEqual(policies.rows, []);
  assert.equal(
    await scalar(
      client,
      "postgres",
      null,
      "select public from storage.buckets where id = 'workout-photos'",
      [],
    ),
    true,
  );

  await client.query(`
    alter table storage.objects owner to current_user;
    alter table storage.buckets owner to current_user;
  `);
  const ownerNotices = await queryNotices(client, block);
  assert.deepEqual(ownerNotices, []);
  const restored = await client.query(`
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname
  `);
  assert.deepEqual(
    restored.rows.map((row) => row.policyname),
    [...storagePolicyNames].sort(),
  );
  assert.equal(
    await scalar(
      client,
      "postgres",
      null,
      "select public from storage.buckets where id = 'workout-photos'",
      [],
    ),
    false,
  );
}

async function storageMigrationBlock() {
  const sql = await readFile(
    path.join(repoRoot, "supabase/migrations/20261030140000_enable_row_level_security.sql"),
    "utf8",
  );
  const start = sql.lastIndexOf("do $$");
  assert.ok(start > 0);
  const block = sql.slice(start).trim();
  assert.match(block, /^do \$\$/);
  assert.match(block, /insufficient_privilege/);
  assert.doesNotMatch(block, /storage\.objects enable row level security/);
  return block;
}

async function queryNotices(client, sql) {
  const notices = [];
  const onNotice = (notice) => notices.push(notice.message);
  client.on("notice", onNotice);
  try {
    await client.query(sql);
  } finally {
    client.off("notice", onNotice);
  }
  return notices;
}

function normalizeRoles(roles) {
  const values = Array.isArray(roles)
    ? roles
    : String(roles).replace(/[{}]/g, "").split(",").filter(Boolean);
  return [...values].sort();
}
