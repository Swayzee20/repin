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

test("PR detection backfill, share swap, undo, and recompute", async () => {
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

    const first = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      name: "Back Squat",
      sets: [{ reps: 1, load: 315, loadUnit: "lb" }],
    });
    assert.equal(first.pr.prompts.length, 1);
    assert.equal(first.pr.detected.length, 0);
    assert.equal(
      await scalar(client, "select count(*)::int from personal_records"),
      0,
    );

    const unansweredThenBetter = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-10-08T12:00:00.000Z"),
      name: "Back Squat",
      sets: [{ reps: 1, load: 325, loadUnit: "lb" }],
    });
    assert.equal(unansweredThenBetter.pr.prompts.length, 0);
    assert.equal(unansweredThenBetter.pr.detected.length, 1);
    assert.equal(unansweredThenBetter.pr.detected[0].autoDetected, true);
    const records = await client.query(
      "select source, baseline_only, celebrated, display_value from personal_records",
    );
    assert.equal(records.rowCount, 1);
    assert.equal(records.rows[0].source, "logged");
    assert.equal(records.rows[0].baseline_only, false);
    assert.equal(records.rows[0].celebrated, true);

    const again = await db.detectPersonalRecordsForSession({
      userId: ada.id,
      groupId: crew.id,
      sessionId: unansweredThenBetter.id,
    });
    assert.equal(again.detected.length, 0);
    assert.equal(again.prompts.length, 0);
    assert.equal(
      await scalar(client, "select count(*)::int from personal_records"),
      1,
    );

    const quietAmrap = await logFormat(db, ada, crew.id, {
      occurredAt: new Date("2026-10-09T12:00:00.000Z"),
      name: "Cindy",
      workoutFormat: "amrap",
      formatDurationSeconds: 1200,
      scoreRounds: 18,
      scoreReps: 5,
      movements: [{
        movementName: "Pull-Up",
        sets: [{ reps: 5, load: null, loadUnit: null }],
      }],
    });
    assert.equal(quietAmrap.pr.prompts.length, 0);
    assert.equal(quietAmrap.pr.detected.length, 0);
    assert.equal(
      await scalar(client, "select baseline_only from personal_records where kind = 'amrap'"),
      true,
    );

    const betterAmrap = await logFormat(db, ada, crew.id, {
      occurredAt: new Date("2026-10-10T12:00:00.000Z"),
      name: "Cindy",
      workoutFormat: "amrap",
      formatDurationSeconds: 1200,
      scoreRounds: 20,
      scoreReps: 0,
      movements: [{
        movementName: "Pull-Up",
        sets: [{ reps: 5, load: null, loadUnit: null }],
      }],
    });
    assert.equal(betterAmrap.pr.detected.length, 1);
    assert.equal(betterAmrap.pr.detected[0].autoDetected, true);

    const distance = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      workoutSubtype: "distance",
      title: "5K",
      name: "5K",
      durationMinutes: 24,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date("2026-10-11T12:00:00.000Z"),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1450, unit: "seconds" },
      ],
    });
    assert.equal(distance.pr.prompts.length, 0);
    assert.equal(distance.pr.detected.length, 0);

    const twoLift = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-11-01T12:00:00.000Z"),
      name: "Heavy day",
      movements: [
        { movementName: "Back Squat", sets: [{ reps: 1, load: 335, loadUnit: "lb" }] },
        { movementName: "Deadlift", sets: [{ reps: 1, load: 405, loadUnit: "lb" }] },
      ],
    });
    assert.equal(twoLift.pr.detected.length, 1);
    assert.equal(twoLift.pr.prompts.length, 1);
    const deadliftPrompt = twoLift.pr.prompts[0];
    await db.answerPersonalRecordPrompts({
      userId: ada.id,
      groupId: crew.id,
      sessionId: twoLift.id,
      answers: [{ kind: deadliftPrompt.kind, key: deadliftPrompt.key, confirmed: true }],
    });
    const sharedTwo = await db.shareSessionPersonalRecords({
      userId: ada.id,
      groupId: crew.id,
      sessionId: twoLift.id,
    });
    assert.equal(sharedTwo.length, 2);
    const twoDetail = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: twoLift.id,
    });
    assert.equal(twoDetail.prBadges.length, 2);

    const newerSquat = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-11-09T12:00:00.000Z"),
      name: "Back Squat",
      sets: [{ reps: 1, load: 345, loadUnit: "lb" }],
    });
    assert.equal(newerSquat.pr.detected.length, 1);
    const newerBadges = await db.shareSessionPersonalRecords({
      userId: ada.id,
      groupId: crew.id,
      sessionId: newerSquat.id,
    });
    assert.equal(newerBadges.length, 1);
    const olderAfterSwap = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: twoLift.id,
    });
    assert.equal(olderAfterSwap.prBadges.length, 1);
    assert.equal(olderAfterSwap.prBadges[0].label, "Deadlift");
    const feed = await db.listRecentWorkoutsForMember({
      userId: ada.id,
      groupId: crew.id,
      includeCommentCounts: false,
      includeReactionCounts: false,
    });
    assert.ok(Array.isArray(feed));
    const newerFeed = feed.find((item) => item.id === newerSquat.id);
    const olderFeed = feed.find((item) => item.id === twoLift.id);
    assert.equal(newerFeed.prBadges.length, 1);
    assert.equal(olderFeed.prBadges.length, 1);

    const removedKeys = newerBadges.map((badge) => ({ kind: badge.kind, key: badge.key }));
    const remaining = await db.removeCommunityPostPrBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: newerSquat.id,
    });
    assert.equal(remaining.length, 0);
    const afterRemove = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: newerSquat.id,
    });
    assert.equal(afterRemove.prBadges.length, 0);
    const restored = await db.restoreCommunityPostPrBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: newerSquat.id,
      badges: removedKeys,
    });
    assert.equal(restored.length, 1);
    const afterUndo = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: newerSquat.id,
    });
    assert.equal(afterUndo.prBadges.length, 1);

    await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: newerSquat.id,
      workoutType: "strength_training",
      name: "Back Squat",
      durationMinutes: null,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date("2026-11-09T12:00:00.000Z"),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 5, load: 225, loadUnit: "lb" }],
      }],
    });
    const edited = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: newerSquat.id,
    });
    assert.equal(edited.prBadges.length, 0);
    const afterEditOlder = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: twoLift.id,
    });
    assert.equal(afterEditOlder.prBadges.length, 1);
    assert.equal(afterEditOlder.prBadges[0].label, "Deadlift");

    const bench = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-11-02T12:00:00.000Z"),
      name: "Bench Press",
      sets: [{ reps: 1, load: 185, loadUnit: "lb" }],
    });
    assert.equal(bench.pr.prompts.length, 1);
    await db.answerPersonalRecordPrompts({
      userId: ada.id,
      groupId: crew.id,
      sessionId: bench.id,
      answers: [{
        kind: bench.pr.prompts[0].kind,
        key: bench.pr.prompts[0].key,
        confirmed: true,
      }],
    });
    const benchBadges = await db.shareSessionPersonalRecords({
      userId: ada.id,
      groupId: crew.id,
      sessionId: bench.id,
    });
    assert.equal(benchBadges.length, 1);
    const heavierBench = await logStrength(db, ada, crew.id, {
      occurredAt: new Date("2026-11-03T12:00:00.000Z"),
      name: "Bench Press",
      sets: [{ reps: 1, load: 205, loadUnit: "lb" }],
    });
    assert.equal(heavierBench.pr.detected.length, 1);
    const olderBenchBeforeDelete = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: bench.id,
    });
    assert.equal(olderBenchBeforeDelete.prBadges.length, 1);
    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: heavierBench.id,
      deleteWorkout: true,
    });
    const olderBenchAfterDelete = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: bench.id,
    });
    assert.equal(olderBenchAfterDelete.prBadges.length, 1);
    assert.equal(olderBenchAfterDelete.prBadges[0].label, "Bench Press");

    const deletedKeysBefore = await scalar(
      client,
      "select count(*)::int from personal_records where kind = 'heaviest_single'",
    );
    assert.ok(deletedKeysBefore >= 1);
    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: twoLift.id,
      deleteWorkout: true,
    });
    const afterDelete = await client.query(
      "select kind, key, celebrated, baseline_only from personal_records where kind = 'heaviest_single'",
    );
    assert.ok(afterDelete.rowCount >= 1);
    assert.equal(
      await scalar(client, "select count(*)::int from community_post_prs where display_label = 'Deadlift'"),
      0,
    );
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

function logStrength(db, user, groupId, input) {
  const movements = input.movements ?? [{
    movementName: input.name,
    notes: null,
    sets: input.sets,
  }];
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "strength_training",
    title: input.name,
    name: input.name,
    durationMinutes: null,
    effort: 3,
    caption: null,
    photoPath: null,
    occurredAt: input.occurredAt,
    movements: movements.map((movement) => ({
      movementName: movement.movementName,
      notes: null,
      sets: movement.sets,
    })),
  });
}

function logFormat(db, user, groupId, input) {
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "functional_fitness",
    title: input.name,
    name: input.name,
    durationMinutes: null,
    effort: 3,
    caption: null,
    photoPath: null,
    occurredAt: input.occurredAt,
    workoutFormat: input.workoutFormat,
    formatDurationSeconds: input.formatDurationSeconds ?? null,
    timeCapSeconds: input.timeCapSeconds ?? null,
    scoreFinished: input.scoreFinished ?? null,
    scoreTimeSeconds: input.scoreTimeSeconds ?? null,
    scoreRounds: input.scoreRounds ?? null,
    scoreReps: input.scoreReps ?? null,
    movements: input.movements.map((movement) => ({
      movementName: movement.movementName,
      notes: null,
      sets: movement.sets,
    })),
  });
}

async function scalar(client, text, params = []) {
  const result = await client.query(text, params);
  const [row] = result.rows;
  return row ? row[Object.keys(row)[0]] : undefined;
}

async function recreateDatabase() {
  assertLocalDatabaseUrl(sourceUrl);
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_personal_records_test with (force)");
    await admin.query("create database repin_personal_records_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_personal_records_test");
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
