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

test("last-session reads only the caller's previous sets", async () => {
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
    const alpha = await db.createGroup({ ownerId: ada.id, name: "Alpha Crew" });
    await db.joinGroup({
      userId: byron.id,
      groupId: alpha.id,
      inviteCode: alpha.inviteCode,
    });

    const benchId = crypto.randomUUID();
    await client.query(
      "insert into movements (id, name, slug) values ($1, 'Barbell Bench Press', 'barbell-bench-press')",
      [benchId],
    );

    const early = await logStrength(db, ada, alpha.id, {
      occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      movementName: "Landmine",
      sets: [
        { reps: 5, load: 155, loadUnit: "lb" },
        { reps: 5, load: 155, loadUnit: "lb" },
        { reps: 5, load: 155, loadUnit: "lb" },
      ],
    });
    const latest = await logStrength(db, ada, alpha.id, {
      occurredAt: new Date("2026-10-08T12:00:00.000Z"),
      movementName: "landmine",
      sets: [{ reps: 3, load: 185, loadUnit: "lb" }],
    });
    await logStrength(db, ada, alpha.id, {
      occurredAt: new Date("2026-10-09T12:00:00.000Z"),
      movementId: benchId,
      movementName: "Barbell Bench Press",
      sets: [
        { reps: 5, load: 160, loadUnit: "lb" },
        { reps: 5, load: 160, loadUnit: "lb" },
        { reps: 5, load: 160, loadUnit: "lb" },
      ],
    });
    await logStrength(db, byron, alpha.id, {
      occurredAt: new Date("2026-10-10T12:00:00.000Z"),
      movementName: "Landmine",
      sets: [{ reps: 8, load: 60, loadUnit: "kg" }],
    });

    const adaLatest = await db.getLastMovementSessionForUser({
      userId: ada.id,
      movementName: "  LANDMINE ",
    });
    assert.ok(early);
    assert.ok(latest);
    assert.ok(adaLatest);
    assert.equal(adaLatest.movementName, "landmine");
    assert.equal(adaLatest?.sets.length, 1);
    assert.equal(adaLatest?.sets[0]?.reps, 3);
    assert.equal(adaLatest?.sets[0]?.load, 185);
    assert.equal(adaLatest?.sets[0]?.loadUnit, "lb");
    assert.equal(new Date(adaLatest.occurredAt).getTime(), new Date(latest.occurredAt).getTime());

    const adaPrevious = await db.getLastMovementSessionForUser({
      userId: ada.id,
      movementName: "Landmine",
      excludeSessionId: latest.id,
    });
    assert.ok(adaPrevious);
    assert.equal(adaPrevious.sets[0]?.load, 155);
    assert.equal(new Date(adaPrevious.occurredAt).getTime(), new Date(early.occurredAt).getTime());

    const adaCatalog = await db.getLastMovementSessionForUser({
      userId: ada.id,
      movementId: benchId,
    });
    assert.equal(adaCatalog?.movementId, benchId);
    assert.equal(adaCatalog?.sets.length, 3);
    assert.equal(adaCatalog?.sets[0]?.load, 160);

    const byronOwn = await db.getLastMovementSessionForUser({
      userId: byron.id,
      movementName: "Landmine",
    });
    assert.equal(byronOwn?.sets[0]?.load, 60);
    assert.equal(byronOwn?.sets[0]?.loadUnit, "kg");
    assert.notEqual(byronOwn?.occurredAt, adaLatest?.occurredAt);

    const cyrusNone = await db.getLastMovementSessionForUser({
      userId: cyrus.id,
      movementName: "Landmine",
    });
    assert.equal(cyrusNone, null);
    assert.equal(await db.getLastMovementSessionForUser({
      userId: ada.id,
      movementName: "No such lift",
    }), null);

    const adaSetIds = await idsAs(
      client,
      "authenticated",
      ada.id,
      `select set_results.id
       from set_results
       join session_movement_results on session_movement_results.id = set_results.session_movement_result_id
       where session_movement_results.workout_session_id = $1
       order by set_results.position`,
      [latest.id],
    );
    assert.equal(adaSetIds.length, 1);

    const byronCanSeeAdaSets = await idsAs(
      client,
      "authenticated",
      byron.id,
      `select set_results.id
       from set_results
       join session_movement_results on session_movement_results.id = set_results.session_movement_result_id
       where session_movement_results.workout_session_id = $1`,
      [latest.id],
    );
    assert.deepEqual(byronCanSeeAdaSets, adaSetIds);

    const cyrusSeesAdaSets = await idsAs(
      client,
      "authenticated",
      cyrus.id,
      `select set_results.id
       from set_results
       join session_movement_results on session_movement_results.id = set_results.session_movement_result_id
       where session_movement_results.workout_session_id = $1`,
      [latest.id],
    );
    assert.deepEqual(cyrusSeesAdaSets, []);
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
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "strength_training",
    title: input.movementName,
    name: input.movementName,
    durationMinutes: null,
    effort: 3,
    caption: null,
    photoPath: null,
    occurredAt: input.occurredAt,
    movements: [{
      movementId: input.movementId ?? null,
      movementName: input.movementName,
      notes: null,
      sets: input.sets,
    }],
  });
}

async function recreateDatabase() {
  assertLocalDatabaseUrl(sourceUrl);
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_last_session_test with (force)");
    await admin.query("create database repin_last_session_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_last_session_test");
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
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    await client.query(`set local role ${role}`);
    const value = await client.query(text, params);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function idsAs(client, role, userId, text, params = []) {
  const result = await queryAs(client, role, userId, text, params);
  return result.rows.map((row) => row.id);
}
