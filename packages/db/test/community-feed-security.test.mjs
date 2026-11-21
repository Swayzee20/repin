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

test("community feed pagination never leaks other crews, blocks, or reports, and member counts match Home", async () => {
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

    const morning = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const track = await db.createGroup({ ownerId: ada.id, name: "Track Club" });
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: morning.inviteCode });
    await db.joinGroupByInviteCode({ userId: byron.id, inviteCode: morning.inviteCode });

    const morningIds = [];
    for (let index = 0; index < 12; index += 1) {
      const published = await publishPost(db, ada, [morning.id], `Morning ${index}`);
      morningIds.push(published.posts[0].id);
    }
    const mayaPost = await publishPost(db, maya, [morning.id], "Maya morning");
    morningIds.push(mayaPost.posts[0].id);
    const reported = await publishPost(db, ada, [morning.id], "Please hide me");
    morningIds.push(reported.posts[0].id);

    const trackIds = [];
    for (let index = 0; index < 8; index += 1) {
      const published = await publishPost(db, ada, [track.id], `Track ${index}`);
      trackIds.push(published.posts[0].id);
    }

    assert.equal(await db.listCommunityFeedForMember({
      viewerUserId: outsider.id,
      groupId: morning.id,
      limit: 20,
    }), null);
    assert.equal(await db.listCommunityFeedForMember({
      viewerUserId: byron.id,
      groupId: track.id,
      limit: 20,
    }), null);

    const byronMorning = await collectFeedIds(db, byron.id, morning.id);
    assert.ok(byronMorning);
    for (const id of trackIds) {
      assert.equal(byronMorning.includes(id), false, "pagination leaked a post from a crew the viewer is not in");
    }
    for (const id of morningIds) {
      assert.equal(byronMorning.includes(id), true);
    }

    await db.createContentReportForMember({
      userId: byron.id,
      targetType: "post",
      targetId: reported.posts[0].id,
      reason: "spam",
    });
    const afterReport = await collectFeedIds(db, byron.id, morning.id);
    assert.equal(afterReport.includes(reported.posts[0].id), false);
    assert.equal((await collectFeedIds(db, ada.id, morning.id)).includes(reported.posts[0].id), true);

    await db.blockUserForMember({ blockerId: byron.id, blockedId: maya.id });
    const afterBlock = await collectFeedIds(db, byron.id, morning.id);
    assert.equal(afterBlock.includes(mayaPost.posts[0].id), false);
    assert.equal((await collectFeedIds(db, ada.id, morning.id)).includes(mayaPost.posts[0].id), true);

    const now = new Date("2026-11-18T21:41:00.000Z");
    const weekStart = new Date("2026-11-15T06:00:00.000Z");
    const weekEnd = new Date("2026-11-22T06:00:00.000Z");
    const thisWeekWorkout = await postWorkout(db, {
      user: ada,
      groupId: morning.id,
      occurredAt: new Date("2026-11-18T16:00:00.000Z"),
      title: "Ada this week",
    });
    const lastWeekWorkout = await postWorkout(db, {
      user: ada,
      groupId: morning.id,
      occurredAt: new Date("2026-11-08T18:00:00.000Z"),
      title: "Ada last week",
    });
    await client.query(
      "update community_posts set created_at = $2 where workout_session_id = $1",
      [lastWeekWorkout.id, now],
    );
    await publishPost(db, ada, [morning.id], "General this week");

    const members = await db.listCrewMembers({
      groupId: morning.id,
      viewerUserId: byron.id,
      weekStart,
      weekEnd,
      now,
    });
    const adaRow = members.find((row) => row.userId === ada.id);
    assert.equal(adaRow?.workoutsThisWeek, 1);
    const mayaRow = members.find((row) => row.userId === maya.id);
    assert.equal(mayaRow?.workoutsThisWeek, 0);
    assert.ok(thisWeekWorkout.id);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function collectFeedIds(db, viewerUserId, groupId) {
  const ids = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await db.listCommunityFeedForMember({
      viewerUserId,
      groupId,
      cursor,
      limit: 5,
    });
    if (!result) return null;
    ids.push(...result.items.map((item) => item.id));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return ids;
}

async function publishPost(db, user, groupIds, body) {
  const draft = await db.createGeneralPublicationDraft({ authorId: user.id });
  return db.publishGeneralPost({
    authorId: user.id,
    publicationId: draft.id,
    body,
    groupIds,
    photoIds: [],
  });
}

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
    await admin.query("drop database if exists repin_community_feed_security_test with (force)");
    await admin.query("create database repin_community_feed_security_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_community_feed_security_test");
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
