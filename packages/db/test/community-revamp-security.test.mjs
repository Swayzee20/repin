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

assertLocalDatabaseUrl(sourceUrl);

test("non-members, blocked authors, and reported posts never appear in Progress, Highlights, Activity, who-reacted, or comment previews", async () => {
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
    const maya = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Maya" });
    const byron = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Byron" });
    const outsider = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Outsider" });
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    await db.joinGroup({ userId: maya.id, groupId: crew.id, inviteCode: crew.inviteCode });
    await db.joinGroup({ userId: byron.id, groupId: crew.id, inviteCode: crew.inviteCode });

    const now = new Date("2026-11-18T21:41:00.000Z");
    const weekStart = new Date("2026-11-15T06:00:00.000Z");
    const weekEnd = new Date("2026-11-22T06:00:00.000Z");
    const todayStart = new Date("2026-11-18T06:00:00.000Z");
    const timeZone = "America/Chicago";
    const bounds = { weekStart, weekEnd, rangeEnd: now, todayStart, timeZone };

    const adaWorkout = await postWorkout(db, {
      user: ada,
      groupId: crew.id,
      occurredAt: new Date("2026-11-18T14:00:00.000Z"),
      title: "Ada run",
    });
    const mayaWorkout = await postWorkout(db, {
      user: maya,
      groupId: crew.id,
      occurredAt: new Date("2026-11-18T15:00:00.000Z"),
      title: "Maya run",
    });
    const byronWorkout = await postWorkout(db, {
      user: byron,
      groupId: crew.id,
      occurredAt: new Date("2026-11-18T16:00:00.000Z"),
      title: "Byron run",
    });

    await db.setCommunityPostReactionForMember({
      userId: maya.id,
      groupId: crew.id,
      postId: adaWorkout.communityPostId,
      reactionType: "fire",
    });
    await db.createCommunityPostCommentForMember({
      userId: maya.id,
      displayName: maya.displayName,
      groupId: crew.id,
      postId: adaWorkout.communityPostId,
      text: "Nice pace!",
    });

    assert.equal(await db.getCrewProgressForMember({
      groupId: crew.id,
      viewerUserId: outsider.id,
      ...bounds,
    }), null);
    assert.equal(await db.listCrewHighlightsForMember({
      groupId: crew.id,
      viewerUserId: outsider.id,
      ...bounds,
    }), null);
    assert.equal(await db.listCrewActivityForMember({
      groupId: crew.id,
      viewerUserId: outsider.id,
      now,
    }), null);
    assert.equal(await db.listVisibleReactionsForPost({
      groupId: crew.id,
      viewerUserId: outsider.id,
      postId: adaWorkout.communityPostId,
    }), null);

    const memberProgress = await db.getCrewProgressForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    assert.ok(memberProgress.members.some((row) => row.userId === maya.id));
    assert.equal(memberProgress.sharedWorkouts >= 3, true);

    const memberHighlights = await db.listCrewHighlightsForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    const homeHighlights = await db.listCrewHighlightsForHome({
      groupId: crew.id,
      viewerUserId: ada.id,
      todayStart,
      weekStart,
      weekEnd,
      now,
      timeZone,
    });
    assert.equal(
      memberHighlights.weekly.map((row) => `${row.userId}:${row.count}`).join("|"),
      homeHighlights.weekly.map((row) => `${row.userId}:${row.count}`).join("|"),
    );
    assert.equal(homeHighlights.firstToRepInToday?.userId, memberHighlights.firstToRepInToday?.userId);

    const comments = await db.listLatestCommentsForPosts({
      viewerUserId: ada.id,
      postIds: [adaWorkout.communityPostId],
    });
    assert.equal(comments.get(adaWorkout.communityPostId)?.text.includes("Nice pace"), true);

    await db.blockUserForMember({ blockerId: ada.id, blockedId: maya.id });
    const blockedProgress = await db.getCrewProgressForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    assert.equal(blockedProgress.members.some((row) => row.userId === maya.id), false);
    const blockedHighlights = await db.listCrewHighlightsForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    assert.equal(blockedHighlights.weekly.some((row) => row.userId === maya.id), false);
    assert.equal(blockedHighlights.firstToRepInToday?.userId === maya.id, false);
    const blockedComments = await db.listLatestCommentsForPosts({
      viewerUserId: ada.id,
      postIds: [adaWorkout.communityPostId],
    });
    assert.equal(blockedComments.has(adaWorkout.communityPostId), false);
    const blockedWho = await db.listVisibleReactionsForPost({
      groupId: crew.id,
      viewerUserId: ada.id,
      postId: adaWorkout.communityPostId,
    });
    assert.equal(blockedWho.groups.some((group) => group.reactors.some((row) => row.userId === maya.id)), false);
    const blockedActivity = await db.listCrewActivityForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      now,
    });
    assert.equal(blockedActivity.items.some((item) => item.actorUserId === maya.id), false);

    await db.unblockUserForMember({ blockerId: ada.id, blockedId: maya.id });
    await db.createContentReportForMember({
      userId: ada.id,
      targetType: "post",
      targetId: byronWorkout.communityPostId,
      reason: "spam",
    });
    const reportedProgress = await db.getCrewProgressForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    assert.equal(reportedProgress.members.find((row) => row.userId === byron.id)?.workouts ?? 0, 0);
    const reportedHighlights = await db.listCrewHighlightsForMember({
      groupId: crew.id,
      viewerUserId: ada.id,
      ...bounds,
    });
    assert.equal(reportedHighlights.weekly.some((row) => row.userId === byron.id), false);
    const reportedWho = await db.listVisibleReactionsForPost({
      groupId: crew.id,
      viewerUserId: ada.id,
      postId: byronWorkout.communityPostId,
    });
    assert.equal(reportedWho, null);
    assert.ok(mayaWorkout.communityPostId);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function postWorkout(db, { user, groupId, occurredAt, title }) {
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "run",
    title,
    name: title,
    durationMinutes: 30,
    effort: 3,
    caption: null,
    photoPath: null,
    occurredAt,
    metrics: [{ metricType: "distance", numericValue: 4, unit: "mi" }],
  });
}

async function recreateDatabase() {
  assertLocalDatabaseUrl(sourceUrl);
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_community_revamp_security_test with (force)");
    await admin.query("create database repin_community_revamp_security_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_community_revamp_security_test");
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
    grant usage on schema private to repin_api;
    grant execute on function private.community_post_visible_to(uuid, uuid) to repin_api;
    grant execute on function private.general_publication_visible_to(uuid, uuid) to repin_api;
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
