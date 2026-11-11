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

test("owner-only dashboard reads hide another member's workouts, bests, and totals", async () => {
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
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    await db.joinGroup({ userId: byron.id, groupId: crew.id, inviteCode: crew.inviteCode });

    const adaPosted = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      title: "Ada 5K",
      name: "Ada 5K",
      durationMinutes: 28,
      effort: 3,
      caption: "secret caption",
      photoPath: "groups/photo.jpg",
      occurredAt: new Date("2026-11-10T16:00:00.000Z"),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1680, unit: "s" },
      ],
    });
    const byronPosted = await db.createWorkoutForMember({
      userId: byron.id,
      displayName: byron.displayName,
      groupId: crew.id,
      workoutType: "run",
      title: "Byron 10K",
      name: "Byron 10K",
      durationMinutes: 50,
      effort: 4,
      caption: "byron only",
      photoPath: null,
      occurredAt: new Date("2026-11-10T17:00:00.000Z"),
      metrics: [{ metricType: "distance", numericValue: 10, unit: "km" }],
    });

    const privateId = crypto.randomUUID();
    await client.query(
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values ($1, $2, 'strength_training', 'Private lift', $3)`,
      [privateId, ada.id, new Date("2026-11-09T16:00:00.000Z")],
    );

    await client.query(
      `insert into personal_records (
         user_id, kind, key, display_label, display_value, source, baseline_only, celebrated, source_session_id
       ) values
       ($1, 'heaviest_single', 'hs:name:ada-only', 'Ada squat', '315 lb', 'logged', false, true, $2),
       ($3, 'heaviest_single', 'hs:name:byron-only', 'Byron squat', '225 lb', 'logged', false, true, $4)`,
      [ada.id, adaPosted.id, byron.id, byronPosted.id],
    );

    const now = new Date("2026-11-11T18:00:00.000Z");
    const adaList = await db.listOwnedWorkouts({
      userId: ada.id,
      timeZone: "America/Chicago",
      now,
    });
    const adaIds = adaList.workouts.map((row) => row.id);
    assert.ok(adaIds.includes(adaPosted.id));
    assert.ok(adaIds.includes(privateId));
    assert.equal(adaIds.includes(byronPosted.id), false);

    const leaked = await db.getOwnedWorkoutDetail({
      userId: ada.id,
      sessionId: byronPosted.id,
    });
    assert.equal(leaked, null);

    const own = await db.getOwnedWorkoutDetail({
      userId: ada.id,
      sessionId: adaPosted.id,
    });
    assert.ok(own);
    assert.equal(own.title, "Ada 5K");
    assert.equal("caption" in own, false);
    assert.equal("photoPath" in own, false);
    assert.equal("photoUrl" in own, false);
    assert.equal("notes" in own, false);
    assert.equal("communityPostId" in own, false);
    assert.equal("reactions" in own, false);

    const missing = await db.getOwnedWorkoutDetail({
      userId: byron.id,
      sessionId: privateId,
    });
    assert.equal(missing, null);

    const adaStats = await db.getOwnedWorkoutStats({
      userId: ada.id,
      timeZone: "America/Chicago",
      now,
    });
    const byronStats = await db.getOwnedWorkoutStats({
      userId: byron.id,
      timeZone: "America/Chicago",
      now,
    });
    assert.equal(adaStats.week.workoutCount >= 1, true);
    assert.equal(byronStats.week.workoutCount, 1);
    assert.notEqual(adaStats.week.workoutCount, byronStats.week.workoutCount);

    const adaBests = await db.listOwnedPersonalRecords({ userId: ada.id });
    const byronBests = await db.listOwnedPersonalRecords({ userId: byron.id });
    assert.equal(adaBests.bests.some((best) => best.label === "Ada squat"), true);
    assert.equal(adaBests.bests.some((best) => best.label === "Byron squat"), false);
    assert.equal(byronBests.bests.some((best) => best.label === "Byron squat"), true);
    assert.equal(byronBests.bests.some((best) => best.label === "Ada squat"), false);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function recreateDatabase() {
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_profile_dashboard_test with (force)");
    await admin.query("create database repin_profile_dashboard_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_profile_dashboard_test");
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
