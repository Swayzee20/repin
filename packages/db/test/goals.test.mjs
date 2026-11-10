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

test("goal slots, auto-reach, reopen, recompute, and hand-mark share rejection", async () => {
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
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const activation = new Date(Date.now() - 60_000);

    const volume = async () => db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 10,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: activation,
    });

    const firstFive = [];
    for (let index = 0; index < 5; index += 1) firstFive.push(await volume());
    assert.equal(firstFive.length, 5);
    await assert.rejects(
      () => volume(),
      (error) => error.name === "GoalRequestError" && error.statusCode === 409,
    );

    await db.archiveGoalForUser(ada.id, firstFive[0].id);
    const extra = await volume();
    assert.equal(extra.state, "active");

    const lift = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 300,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Back Squat",
      lane: null,
      now: activation,
    }).catch(() => null);
    assert.equal(lift, null, "one-time lift needs a free slot after five actives");

    await db.archiveGoalForUser(ada.id, extra.id);
    const liftGoal = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 300,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Back Squat",
      lane: null,
      now: activation,
    });

    const posted = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Back Squat",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 1, load: 315, loadUnit: "lb" }],
      }],
    });
    assert.ok(posted.goals.reached.some((item) => item.goalId === liftGoal.id));
    const afterReach = await db.listGoalsForUser(ada.id);
    assert.equal(afterReach.active.some((goal) => goal.id === liftGoal.id), false);
    assert.equal(afterReach.history.some((goal) => goal.id === liftGoal.id && goal.state === "reached"), true);

    const badges = await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
    });
    assert.equal(badges.length, 1);

    const edited = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: posted.id,
      workoutType: "strength_training",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 5, load: 135, loadUnit: "lb" }],
      }],
    });
    assert.equal(edited.goals.reached.length, 0);
    assert.equal(
      await scalar(client, "select count(*)::int from community_post_goals"),
      0,
    );

    const afterInvalidate = await db.getGoalForUser(ada.id, liftGoal.id);
    assert.equal(afterInvalidate.state, "active");
    await db.archiveGoalForUser(ada.id, liftGoal.id);

    const timeGoal = await db.createGoalForUser({
      userId: ada.id,
      kind: "time",
      metric: "time",
      sportFilter: "run",
      target: 1200,
      displayUnit: "s",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: "5k",
      now: activation,
    });
    const tie = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      workoutSubtype: "distance",
      title: "5K",
      name: "5K",
      durationMinutes: 20,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1_200, unit: "s" },
      ],
    });
    assert.equal(tie.goals.reached.some((item) => item.goalId === timeGoal.id), false);
    const faster = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      workoutSubtype: "distance",
      title: "5K",
      name: "5K",
      durationMinutes: 19,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1_199, unit: "s" },
      ],
    });
    assert.equal(faster.goals.reached.some((item) => item.goalId === timeGoal.id), true);

    const hand = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 500,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Deadlift",
      lane: null,
      now: activation,
    });
    const marked = await db.markGoalDoneForUser(ada.id, hand.id);
    assert.equal(marked.completionMethod, "manual");
    await assert.rejects(
      () => db.shareSessionGoalBadges({
        userId: ada.id,
        groupId: crew.id,
        sessionId: posted.id,
        periodIds: marked.currentPeriodId ? [marked.currentPeriodId] : undefined,
      }),
      (error) => error.name === "GoalRequestError",
    );

    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: faster.id,
      deleteWorkout: true,
    });
    const afterDelete = await db.getGoalForUser(ada.id, timeGoal.id);
    assert.ok(afterDelete);
    assert.notEqual(afterDelete.state, "reached");

    const weekly = firstFive[1];
    const weeklyReach = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: activation,
    }).catch(() => weekly);
    const checkIn = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "other",
      title: "Quick check-in",
      name: "Quick check-in",
      durationMinutes: null,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
    });
    const weeklyAfter = await db.getGoalForUser(ada.id, weeklyReach.id);
    if (weeklyAfter.progress.current >= 1 && weeklyAfter.schedule === "weekly") {
      assert.equal(weeklyAfter.state, "active");
      assert.ok(weeklyAfter.activeSlot != null);
    }
    assert.ok(checkIn.id);

    await db.archiveGoalForUser(ada.id, weekly.id);
    await db.archiveGoalForUser(ada.id, firstFive[2].id);
    await db.archiveGoalForUser(ada.id, firstFive[3].id);
    await db.archiveGoalForUser(ada.id, firstFive[4].id);
    const reopened = await db.reopenGoalForUser(ada.id, timeGoal.id);
    assert.equal(reopened.state, "active");
    assert.ok(new Date(reopened.activationAt).getTime() >= activation.getTime());
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function scalar(client, text, params = []) {
  const result = await client.query(text, params);
  const [row] = result.rows;
  return row ? row[Object.keys(row)[0]] : undefined;
}

async function recreateDatabase() {
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_goals_test with (force)");
    await admin.query("create database repin_goals_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_goals_test");
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
