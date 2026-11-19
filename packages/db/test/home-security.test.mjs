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

test("home crew numbers count shared posts only and never leak goals or streaks", async () => {
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
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    await db.joinGroup({ userId: byron.id, groupId: crew.id, inviteCode: crew.inviteCode });
    await db.joinGroup({ userId: cyrus.id, groupId: crew.id, inviteCode: crew.inviteCode });

    const now = new Date("2026-11-18T21:41:00.000Z");
    const sunday = new Date("2026-11-15T18:00:00.000Z");
    const monday = new Date("2026-11-16T18:00:00.000Z");
    const todayMorning = new Date("2026-11-18T14:00:00.000Z");
    const todayLater = new Date("2026-11-18T16:00:00.000Z");
    const weekStart = new Date("2026-11-15T06:00:00.000Z");
    const todayStart = new Date("2026-11-18T06:00:00.000Z");

    await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 4,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: sunday,
    });
    await db.createGoalForUser({
      userId: byron.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 9,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: sunday,
    });

    const adaShared = await postWorkout(db, {
      user: ada,
      groupId: crew.id,
      occurredAt: todayLater,
      title: "Ada shared",
    });
    await postWorkout(db, {
      user: byron,
      groupId: crew.id,
      occurredAt: new Date("2026-11-08T18:00:00.000Z"),
      title: "Byron last week",
    });
    await postWorkout(db, {
      user: byron,
      groupId: crew.id,
      occurredAt: sunday,
      title: "Byron Sunday",
    });
    const byronToday = await postWorkout(db, {
      user: byron,
      groupId: crew.id,
      occurredAt: todayMorning,
      title: "Byron first today",
    });
    await postWorkout(db, {
      user: cyrus,
      groupId: crew.id,
      occurredAt: monday,
      title: "Cyrus one",
    });

    const adaPrivateId = crypto.randomUUID();
    const byronPrivateId = crypto.randomUUID();
    const cyrusPrivateA = crypto.randomUUID();
    const cyrusPrivateB = crypto.randomUUID();
    await client.query(
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values
         ($1, $2, 'run', 'Ada private', $3),
         ($4, $5, 'run', 'Byron private', $6),
         ($7, $8, 'run', 'Cyrus private A', $9),
         ($10, $8, 'run', 'Cyrus private B', $11)`,
      [
        adaPrivateId, ada.id, todayMorning,
        byronPrivateId, byron.id, sunday,
        cyrusPrivateA, cyrus.id, monday,
        cyrusPrivateB, monday,
      ],
    );

    for (let index = 0; index < 21; index += 1) {
      await postWorkout(db, {
        user: byron,
        groupId: crew.id,
        occurredAt: new Date(monday.getTime() + index * 60_000),
        title: `Byron extra ${index}`,
      });
    }

    const adaGoals = await db.listActiveGoalSnapshotsForHome(ada.id, now);
    const byronGoals = await db.listActiveGoalSnapshotsForHome(byron.id, now);
    assert.equal(adaGoals.some((goal) => goal.targetDisplay === 9), false);
    assert.equal(byronGoals.some((goal) => goal.targetDisplay === 4), false);
    assert.equal(adaGoals.some((goal) => goal.targetDisplay === 4), true);

    const adaStreak = await db.getUserWeeklyStreak({
      userId: ada.id,
      timeZone: "America/Chicago",
      now,
    });
    const byronStreak = await db.getUserWeeklyStreak({
      userId: byron.id,
      timeZone: "America/Chicago",
      now,
    });
    assert.equal(adaStreak.weeks, 1);
    assert.equal(byronStreak.weeks >= 2, true);

    const highlights = await db.listCrewHighlightsForHome({
      groupId: crew.id,
      viewerUserId: ada.id,
      todayStart,
      weekStart,
      now,
    });
    assert.equal(highlights.firstToRepInToday?.userId, byron.id);
    const byronCount = highlights.weekly.find((row) => row.userId === byron.id)?.count ?? 0;
    assert.equal(byronCount >= 22, true);
    assert.equal(highlights.weekly.some((row) => row.userId === ada.id), false);
    assert.equal(highlights.weekly.some((row) => row.userId === cyrus.id), false);

    await db.blockUserForMember({ blockerId: ada.id, blockedId: byron.id });
    const blocked = await db.listCrewHighlightsForHome({
      groupId: crew.id,
      viewerUserId: ada.id,
      todayStart,
      weekStart,
      now,
    });
    assert.equal(blocked.firstToRepInToday?.userId === byron.id, false);
    assert.equal(blocked.weekly.some((row) => row.userId === byron.id), false);

    await db.unblockUserForMember({ blockerId: ada.id, blockedId: byron.id });
    await db.createContentReportForMember({
      userId: ada.id,
      targetType: "post",
      targetId: byronToday.communityPostId,
      reason: "spam",
    });
    const reported = await db.listCrewHighlightsForHome({
      groupId: crew.id,
      viewerUserId: ada.id,
      todayStart,
      weekStart,
      now,
    });
    assert.equal(reported.firstToRepInToday?.userId, ada.id);

    await db.leaveCrew({ userId: cyrus.id, groupId: crew.id });
    const afterLeave = await db.listRecentWorkoutsForAuthorizedGroup({
      groupId: crew.id,
      viewerUserId: ada.id,
      limit: 50,
      occurredAtStart: weekStart,
      occurredAtEnd: now,
    });
    assert.equal((afterLeave ?? []).some((row) => row.userId === cyrus.id), false);

    assert.ok(adaShared.communityPostId);
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
    await admin.query("drop database if exists repin_home_security_test with (force)");
    await admin.query("create database repin_home_security_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_home_security_test");
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
