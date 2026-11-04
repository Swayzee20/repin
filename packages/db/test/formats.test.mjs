import assert from "node:assert/strict";
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

test("functional fitness format constraints, RLS, and write path", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    const drizzleFiles = (await readdir(path.join(dbPackageRoot, "drizzle")))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    assert.ok(drizzleFiles.includes("0014_moderation_reports_blocks.sql"));
    assert.ok(drizzleFiles.includes("0015_functional_fitness_formats.sql"));

    for (const file of drizzleFiles.filter((name) => name < "0015")) {
      await applySqlFile(client, path.join(dbPackageRoot, "drizzle", file));
    }

    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const metricId = crypto.randomUUID();
    const movementResultId = crypto.randomUUID();
    await client.query(
      "insert into users (id, display_name) values ($1, 'Ada')",
      [userId],
    );
    await client.query(
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values ($1, $2, 'functional_fitness', 'Legacy Fran', now())`,
      [sessionId, userId],
    );
    await client.query(
      `insert into workout_session_metrics (
         id, workout_session_id, position, metric_type, numeric_value, unit
       ) values ($1, $2, 0, 'distance', 5, 'km')`,
      [metricId, sessionId],
    );
    await client.query(
      `insert into session_movement_results (id, workout_session_id, movement_name, position)
       values ($1, $2, 'Squat', 0)`,
      [movementResultId, sessionId],
    );
    await client.query(
      `insert into set_results (session_movement_result_id, position, reps, load, load_unit)
       values ($1, 0, 5, 60, 'kg')`,
      [movementResultId],
    );

    await applySqlFile(client, path.join(dbPackageRoot, "drizzle", "0015_functional_fitness_formats.sql"));
    assert.equal(
      await scalar(client, "select count(*)::int from workout_sessions where id = $1", [sessionId]),
      1,
    );
    assert.equal(
      await scalar(client, "select workout_format from workout_sessions where id = $1", [sessionId]),
      null,
    );

    await applySupabaseMigrations(client);
    await createBypassRole(client);

    await assertCheckRejected(
      client,
      `insert into workout_sessions (id, user_id, workout_type, workout_format, occurred_at)
       values ($1, $2, 'run', 'amrap', now())`,
      [crypto.randomUUID(), userId],
      "workout_sessions_format_check",
    );
    await assertCheckRejected(
      client,
      `insert into workout_sessions (
         id, user_id, workout_type, workout_format, time_cap_seconds, occurred_at
       ) values ($1, $2, 'functional_fitness', 'amrap', 900, now())`,
      [crypto.randomUUID(), userId],
      "workout_sessions_amrap_shape_check",
    );
    await assertCheckRejected(
      client,
      `insert into workout_sessions (
         id, user_id, workout_type, workout_format, score_finished, score_reps, occurred_at
       ) values ($1, $2, 'functional_fitness', 'for_time', true, 10, now())`,
      [crypto.randomUUID(), userId],
      "workout_sessions_for_time_shape_check",
    );
    await client.query(
      `insert into workout_sessions (id, user_id, workout_type, name, occurred_at)
       values ($1, $2, 'functional_fitness', 'Still legacy', now())`,
      [crypto.randomUUID(), userId],
    );
    await assertCheckRejected(
      client,
      `insert into set_results (session_movement_result_id, position, distance, distance_unit)
       values ($1, 1, 400, 'yd')`,
      [movementResultId],
      "set_results_distance_unit_check",
    );

    const db = await import("../src/index.ts");
    const ada = await db.getOrCreateUser({ id: userId, displayName: "Ada" });
    const byron = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Byron" });
    const group = await db.createGroup({ ownerId: ada.id, name: "Format Crew" });
    assert.ok(group);

    const unknownMovement = crypto.randomUUID();
    await assert.rejects(
      () => createFormatWorkout(db, ada, group.id, {
        workoutFormat: "amrap",
        formatDurationSeconds: 1200,
        scoreRounds: 5,
        scoreReps: 12,
        movements: [{
          movementId: unknownMovement,
          movementName: "Ghost",
          sets: [{ reps: 5 }],
        }],
      }),
      (error) => {
        assert.equal(error.name, "WorkoutRequestError");
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /could not be found/i);
        return true;
      },
    );

    const amrap = await createFormatWorkout(db, ada, group.id, {
      workoutFormat: "amrap",
      formatDurationSeconds: 1200,
      scoreRounds: 5,
      scoreReps: 12,
      name: "AMRAP 20",
      movements: [
        { movementName: "Pull-Up", sets: [{ reps: 5 }] },
        { movementName: "Push-Up", sets: [{ reps: 10 }] },
      ],
    });
    assert.ok(amrap);
    assert.equal(amrap.workoutFormat, "amrap");

    const forTime = await createFormatWorkout(db, ada, group.id, {
      workoutFormat: "for_time",
      timeCapSeconds: 900,
      scoreFinished: true,
      scoreTimeSeconds: 754,
      name: "For Time",
      movements: [{ movementName: "Thruster", sets: [{ reps: 21 }] }],
    });
    const emom = await createFormatWorkout(db, ada, group.id, {
      workoutFormat: "emom",
      formatDurationSeconds: 720,
      formatIntervalSeconds: 60,
      name: "EMOM 12",
      movements: [{ movementName: "Wall Ball", sets: [{ reps: 10 }] }],
    });
    const rounds = await createFormatWorkout(db, ada, group.id, {
      workoutFormat: "rounds",
      formatRounds: 5,
      scoreTimeSeconds: 1100,
      name: "5 rounds",
      movements: [
        { movementName: "Pull-Up", sets: [{ reps: 5 }] },
        { movementName: "Push-Up", sets: [{ reps: 10 }] },
        { movementName: "Sit-Up", sets: [{ reps: 15 }] },
      ],
    });
    assert.ok(forTime && emom && rounds);

    const feed = await db.listRecentWorkoutsForMember({
      userId: ada.id,
      groupId: group.id,
    });
    assert.ok(feed);
    const byId = Object.fromEntries(feed.map((item) => [item.id, item]));
    assert.equal(byId[amrap.id]?.workoutFormat, "amrap");
    assert.equal(byId[amrap.id]?.resultSummary, "AMRAP 20 · 5 rounds + 12 reps");
    assert.equal(byId[forTime.id]?.resultSummary, "For Time · 12:34");
    assert.equal(byId[emom.id]?.resultSummary, "EMOM 12 · 10 Wall Ball");
    assert.equal(byId[rounds.id]?.resultSummary, "5 rounds · 18:20");

    const detail = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: group.id,
      workoutSessionId: amrap.id,
    });
    assert.equal(detail?.format?.type, "amrap");
    assert.equal(detail?.logVersion, 2);
    assert.ok(detail?.metrics.some((metric) => metric.label === "Score" && metric.textValue === "5 rounds + 12 reps"));

    const cleared = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: group.id,
      workoutSessionId: amrap.id,
      workoutType: "functional_fitness",
      name: "Legacy again",
      durationMinutes: null,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date("2026-11-04T12:00:00.000Z"),
      workoutFormat: null,
      metrics: [{ metricType: "score", textValue: "5 rounds + 12 reps" }],
      movements: [],
    });
    assert.ok(cleared);
    const clearedDetail = await db.getCommunityWorkoutDetailForMember({
      userId: ada.id,
      groupId: group.id,
      workoutSessionId: amrap.id,
    });
    assert.equal(clearedDetail?.format, null);
    assert.equal(clearedDetail?.workoutFormat, null);
    assert.equal(clearedDetail?.resultSummary, "5 rounds + 12 reps");
    assert.equal(
      await scalar(client, "select format_duration_seconds from workout_sessions where id = $1", [amrap.id]),
      null,
    );

    const editState = await db.getWorkoutEditStateForOwner({
      userId: ada.id,
      groupId: group.id,
      workoutSessionId: forTime.id,
    });
    assert.deepEqual(editState, {
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      hasMeterDistance: false,
    });

    assert.equal(
      await db.listRecentWorkoutsForMember({ userId: byron.id, groupId: group.id }),
      null,
    );
    assert.deepEqual(
      await idsAs(client, "authenticated", byron.id, "select id from workout_sessions where id = $1", [forTime.id]),
      [],
    );
    assert.equal(
      await scalarAs(client, "authenticated", ada.id, "select workout_format from workout_sessions where id = $1", [forTime.id]),
      "for_time",
    );

    const ownFormatId = crypto.randomUUID();
    await queryAs(
      client,
      "authenticated",
      ada.id,
      `insert into workout_sessions (
         id, user_id, workout_type, workout_format, format_duration_seconds, score_rounds, score_reps, occurred_at
       ) values ($1, $2, 'functional_fitness', 'amrap', 600, 3, 0, now())`,
      [ownFormatId, ada.id],
    );
    await queryAs(
      client,
      "authenticated",
      ada.id,
      "update workout_sessions set score_rounds = 4 where id = $1",
      [ownFormatId],
    );
    await expectDenied(
      client,
      "authenticated",
      byron.id,
      `insert into workout_sessions (
         id, user_id, workout_type, workout_format, format_rounds, occurred_at
       ) values ($1, $2, 'functional_fitness', 'rounds', 5, now())`,
      [crypto.randomUUID(), ada.id],
    );
    const stolenUpdate = await queryAs(
      client,
      "authenticated",
      byron.id,
      "update workout_sessions set score_rounds = 9 where id = $1",
      [ownFormatId],
    );
    assert.equal(stolenUpdate.rowCount, 0);

    await expectDenied(
      client,
      "authenticated",
      ada.id,
      "insert into movements (name, slug) values ('Custom Press', 'custom-press')",
      [],
    );

    const rlsOn = await client.query(`
      select c.relname
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      order by c.relname
    `);
    assert.ok(rlsOn.rows.some((row) => row.relname === "workout_sessions"));
    assert.ok(rlsOn.rows.some((row) => row.relname === "movements"));
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

function createFormatWorkout(db, user, groupId, input) {
  return db.createWorkoutForMember({
    userId: user.id,
    displayName: user.displayName,
    groupId,
    workoutType: "functional_fitness",
    title: input.name ?? "Format",
    name: input.name ?? "Format",
    durationMinutes: input.durationMinutes ?? null,
    effort: 3,
    caption: null,
    photoPath: null,
    occurredAt: new Date("2026-11-04T12:00:00.000Z"),
    ...input,
  });
}

async function recreateDatabase() {
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_formats_test with (force)");
    await admin.query("create database repin_formats_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_formats_test");
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

async function applySupabaseMigrations(client) {
  const directory = path.join(repoRoot, "supabase/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await applySqlFile(client, path.join(directory, file));
  }
}

async function applySqlFile(client, filePath) {
  const sql = await readFile(filePath, "utf8");
  const statements = sql.includes("--> statement-breakpoint")
    ? sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)
    : [sql];
  for (const statement of statements) {
    await client.query(statement);
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

async function assertCheckRejected(client, text, params, constraint) {
  await assert.rejects(
    () => client.query(text, params),
    (error) => {
      assert.equal(error.code, "23514", error.message);
      assert.match(error.message, new RegExp(constraint));
      return true;
    },
  );
}

async function scalar(client, text, params = []) {
  const result = await client.query(text, params);
  const [row] = result.rows;
  if (!row) return undefined;
  return row[Object.keys(row)[0]];
}

async function queryAs(client, role, userId, text, params = []) {
  return asRole(client, role, userId, () => client.query(text, params));
}

async function scalarAs(client, role, userId, text, params = []) {
  const result = await queryAs(client, role, userId, text, params);
  const [row] = result.rows;
  if (!row) return undefined;
  return row[Object.keys(row)[0]];
}

async function idsAs(client, role, userId, text, params = []) {
  const result = await queryAs(client, role, userId, text, params);
  return result.rows.map((row) => row.id);
}

async function expectDenied(client, role, userId, text, params = []) {
  await assert.rejects(
    () => queryAs(client, role, userId, text, params),
    (error) => {
      assert.equal(error.code, "42501", error.message);
      return true;
    },
  );
}

async function asRole(client, role, userId, fn) {
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
