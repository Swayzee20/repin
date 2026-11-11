import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { assertLocalDatabaseUrl } from "./local-database-guard.mjs";

const { Client } = pg;
const dbPackageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceUrl = process.env.DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

test("push recipient selection, reaction batching, and token RLS", async () => {
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
    const byron = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Byron" });
    const cyrus = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Cyrus" });
    const crew = await db.createGroup({ ownerId: ada.id, name: "Sunrise" });
    await db.joinGroup({
      userId: byron.id,
      groupId: crew.id,
      inviteCode: crew.inviteCode,
    });
    await db.joinGroup({
      userId: cyrus.id,
      groupId: crew.id,
      inviteCode: crew.inviteCode,
    });

    const posted = await loggedWorkout(db, ada, crew.id, "Morning run");
    const workoutRecipients = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(
      workoutRecipients.map((row) => row.userId).sort(),
      [byron.id, cyrus.id].sort(),
    );
    assert.ok(workoutRecipients.every((row) => row.groupName === "Sunrise"));
    assert.ok(workoutRecipients.every((row) => row.sessionId === posted.id));

    await db.setCrewNotificationPrefs({
      userId: byron.id,
      groupId: crew.id,
      prefs: {
        muteAll: false,
        crewWorkout: false,
        crewComment: true,
        crewReaction: true,
      },
    });
    const mutedWorkout = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(mutedWorkout.map((row) => row.userId), [cyrus.id]);

    await db.setCrewNotificationPrefs({
      userId: cyrus.id,
      groupId: crew.id,
      prefs: {
        muteAll: true,
        crewWorkout: true,
        crewComment: true,
        crewReaction: true,
      },
    });
    const mutedAll = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(mutedAll, []);

    await db.setCrewNotificationPrefs({
      userId: cyrus.id,
      groupId: crew.id,
      prefs: {
        muteAll: false,
        crewWorkout: true,
        crewComment: true,
        crewReaction: true,
      },
    });

    const openRecipients = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.ok(openRecipients.some((row) => row.userId === cyrus.id));
    await client.query("update groups set closed_at = now() where id = $1", [crew.id]);
    assert.deepEqual(
      await db.listCrewWorkoutPushRecipients({
        actorUserId: ada.id,
        groupId: crew.id,
        sessionId: posted.id,
        contentCreatedAt: posted.createdAt,
      }),
      [],
    );
    await client.query("update groups set closed_at = null where id = $1", [crew.id]);

    const comment = await db.createCommunityPostCommentForMember({
      userId: byron.id,
      displayName: byron.displayName,
      groupId: crew.id,
      workoutSessionId: posted.id,
      text: "secret comment body that must stay off the push",
    });
    assert.ok(comment);
    const commentRecipient = await db.listPostAuthorPushRecipient({
      actorUserId: byron.id,
      groupId: crew.id,
      sessionId: posted.id,
      alertType: "crew_comment",
      contentCreatedAt: comment.createdAt,
    });
    assert.equal(commentRecipient?.userId, ada.id);
    assert.equal(
      await db.listPostAuthorPushRecipient({
        actorUserId: ada.id,
        groupId: crew.id,
        sessionId: posted.id,
        alertType: "crew_comment",
        contentCreatedAt: comment.createdAt,
      }),
      null,
    );

    await db.setCommunityPostReactionForMember({
      userId: byron.id,
      groupId: crew.id,
      workoutSessionId: posted.id,
      reactionType: "fire",
    });
    const reactionRecipient = await db.listPostAuthorPushRecipient({
      actorUserId: byron.id,
      groupId: crew.id,
      sessionId: posted.id,
      alertType: "crew_reaction",
      contentCreatedAt: new Date(),
    });
    assert.equal(reactionRecipient?.userId, ada.id);
    const firstClaim = await db.claimReactionPushSlot(reactionRecipient.postId);
    assert.equal(firstClaim, true);
    const secondClaim = await db.claimReactionPushSlot(reactionRecipient.postId);
    assert.equal(secondClaim, false);
    await client.query(
      "update community_posts set reaction_push_last_sent_at = now() - interval '6 minutes' where id = $1",
      [reactionRecipient.postId],
    );
    const thirdClaim = await db.claimReactionPushSlot(reactionRecipient.postId);
    assert.equal(thirdClaim, true);
    assert.equal(
      await db.countVisibleReactors({
        postId: reactionRecipient.postId,
        authorId: ada.id,
      }),
      1,
    );
    await db.setCommunityPostReactionForMember({
      userId: cyrus.id,
      groupId: crew.id,
      workoutSessionId: posted.id,
      reactionType: "clap",
    });
    assert.equal(
      await db.countVisibleReactors({
        postId: reactionRecipient.postId,
        authorId: ada.id,
      }),
      2,
    );

    await db.leaveCrew({ userId: byron.id, groupId: crew.id });
    const afterLeave = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(afterLeave.map((row) => row.userId), [cyrus.id]);

    const rejoined = await db.joinGroup({
      userId: byron.id,
      groupId: crew.id,
      inviteCode: crew.inviteCode,
    });
    assert.ok(rejoined);
    const afterRejoinOldPost = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(afterRejoinOldPost.map((row) => row.userId), [cyrus.id]);

    await db.removeCrewMember({
      userId: ada.id,
      groupId: crew.id,
      memberId: cyrus.id,
    });
    const afterRemove = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(afterRemove, []);

    const solo = await db.createGroup({ ownerId: ada.id, name: "Solo" });
    const closed = await db.leaveCrew({ userId: ada.id, groupId: solo.id });
    assert.equal(closed.closed, true);
    const closedPosted = await client.query(
      `select id from groups where id = $1 and closed_at is not null`,
      [solo.id],
    );
    assert.equal(closedPosted.rowCount, 1);
    const closedRecipients = await db.listCrewWorkoutPushRecipients({
      actorUserId: ada.id,
      groupId: solo.id,
      sessionId: posted.id,
      contentCreatedAt: posted.createdAt,
    });
    assert.deepEqual(closedRecipients, []);

    const token = "ExponentPushToken[push-test-ada]";
    await db.upsertDevicePushToken({
      userId: ada.id,
      expoPushToken: token,
      platform: "ios",
    });
    await db.upsertDevicePushToken({
      userId: ada.id,
      expoPushToken: token,
      platform: "ios",
    });
    const tokens = await db.listActivePushTokensForUsers([ada.id]);
    assert.deepEqual(tokens.map((row) => row.expoPushToken), [token]);

    await expectDenied(
      client,
      "anon",
      null,
      "select expo_push_token from device_push_tokens",
      [],
      /permission denied/i,
    );
    assert.deepEqual(
      await columnAs(
        client,
        "authenticated",
        byron.id,
        "select expo_push_token from device_push_tokens",
        [],
        "expo_push_token",
      ),
      [],
    );
    assert.deepEqual(
      await columnAs(
        client,
        "authenticated",
        ada.id,
        "select expo_push_token from device_push_tokens",
        [],
        "expo_push_token",
      ),
      [token],
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      "insert into device_push_tokens (user_id, expo_push_token, platform) values ($1, $2, 'ios')",
      [ada.id, "ExponentPushToken[stolen]"],
      /row-level security/i,
    );
    await db.upsertDevicePushToken({
      userId: byron.id,
      expoPushToken: "ExponentPushToken[push-test-byron]",
      platform: "ios",
    });
    const stolenDelete = await queryAs(
      client,
      "authenticated",
      byron.id,
      "delete from device_push_tokens where expo_push_token = $1 returning expo_push_token",
      [token],
    );
    assert.deepEqual(stolenDelete.rows, []);
    assert.deepEqual(
      await columnAs(
        client,
        "authenticated",
        ada.id,
        "select expo_push_token from device_push_tokens where expo_push_token = $1",
        [token],
        "expo_push_token",
      ),
      [token],
    );
    await db.disableDevicePushTokens([token]);
    assert.deepEqual(await db.listActivePushTokensForUsers([ada.id]), []);
    await db.removeDevicePushToken({ userId: byron.id, expoPushToken: "ExponentPushToken[push-test-byron]" });
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

async function recreateDatabase() {
  assertLocalDatabaseUrl(sourceUrl);
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_push_test with (force)");
    await admin.query("create database repin_push_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_push_test");
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
