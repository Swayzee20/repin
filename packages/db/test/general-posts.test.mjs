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

test("general posts: visibility, CRUD, pins, photos, reports, alerts, and mixed feed", async () => {
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
    const ada = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Ada Owner" });
    const maya = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Maya T." });
    const sam = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Sam R." });
    const rio = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Rio P." });
    const outsider = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Outsider" });

    const morning = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const track = await db.createGroup({ ownerId: ada.id, name: "Track Club" });
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: morning.inviteCode });
    await db.joinGroupByInviteCode({ userId: sam.id, inviteCode: morning.inviteCode });
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: track.inviteCode });
    await db.joinGroupByInviteCode({ userId: rio.id, inviteCode: morning.inviteCode });
    await db.joinGroupByInviteCode({ userId: rio.id, inviteCode: track.inviteCode });

    const published = await publishPost(db, ada, [morning.id, track.id], "Thursday track at 6 AM — who is in? https://example.com/gate");
    assert.equal(published.posts.length, 2);
    const morningCopy = published.posts.find((row) => row.groupId === morning.id);
    const trackCopy = published.posts.find((row) => row.groupId === track.id);
    assert.ok(morningCopy && trackCopy);

    const mayaFeed = await db.listCommunityFeedForMember({
      viewerUserId: maya.id,
      groupId: morning.id,
    });
    assert.equal(mayaFeed.items.length, 1);
    assert.equal(mayaFeed.items[0].kind, "general");
    const hydrated = db.hydrateGeneralFeedItems(mayaFeed.items, mayaFeed.publications);
    assert.equal(hydrated[0].kind, "general");
    assert.equal(hydrated[0].destinationCrewNames, undefined);
    assert.ok(hydrated[0].links.some((link) => link.url === "https://example.com/gate"));

    const mayaDetail = await db.getGeneralPostDetailForMember({
      viewerUserId: maya.id,
      postId: morningCopy.id,
    });
    assert.equal(mayaDetail?.destinationCrewNames, undefined);
    assert.equal(mayaDetail?.kind, "general");

    const adaDetail = await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: morningCopy.id,
    });
    assert.deepEqual(adaDetail?.destinationCrewNames, ["Morning Crew", "Track Club"]);

    const samTrackFeed = await db.listCommunityFeedForMember({
      viewerUserId: sam.id,
      groupId: track.id,
    });
    assert.equal(samTrackFeed, null);

    assert.equal(await db.communityPostVisibleTo(sam.id, trackCopy.id), false);
    assert.equal(await db.communityPostVisibleTo(maya.id, morningCopy.id), true);
    assert.equal(await db.communityPostVisibleTo(outsider.id, morningCopy.id), false);

    await db.createCommunityPostCommentForMember({
      userId: maya.id,
      displayName: maya.displayName,
      groupId: morning.id,
      postId: morningCopy.id,
      text: "I'm in.",
    });
    const morningDetail = await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: morningCopy.id,
    });
    const trackDetail = await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: trackCopy.id,
    });
    assert.equal(morningDetail?.comments.length, 1);
    assert.equal(trackDetail?.comments.length, 0);
    assert.equal(morningDetail?.commentCount, 1);
    assert.equal(trackDetail?.commentCount, 0);

    const report = await db.createContentReportForMember({
      userId: rio.id,
      targetType: "post",
      targetId: morningCopy.id,
      reason: "spam",
    });
    assert.equal(report.ok, true);
    assert.equal(await db.communityPostVisibleTo(rio.id, morningCopy.id), false);
    assert.equal(await db.communityPostVisibleTo(rio.id, trackCopy.id), true);
    assert.equal(await db.communityPostVisibleTo(maya.id, morningCopy.id), true);

    const queue = await db.listAdminReportQueue();
    assert.ok(queue.some((item) => item.targetId === morningCopy.id && item.workoutName === "Post"));

    await db.blockUserForMember({ blockerId: maya.id, blockedId: ada.id });
    assert.equal(await db.communityPostVisibleTo(maya.id, morningCopy.id), false);
    await db.unblockUserForMember({ blockerId: maya.id, blockedId: ada.id });
    assert.equal(await db.communityPostVisibleTo(maya.id, morningCopy.id), true);

    await db.leaveCrew({ userId: maya.id, groupId: morning.id });
    assert.equal(await db.communityPostVisibleTo(maya.id, morningCopy.id), false);
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: morning.inviteCode });
    assert.equal(
      await db.communityPostVisibleTo(maya.id, morningCopy.id),
      true,
      "returning viewer can still see other authors' historical posts",
    );

    const later = await publishPost(db, ada, [morning.id], "After Maya rejoined");
    assert.equal(await db.communityPostVisibleTo(maya.id, later.posts[0].id), true);

    const mayaPost = await publishPost(db, maya, [morning.id], "Maya's old post");
    await db.leaveCrew({ userId: maya.id, groupId: morning.id });
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: morning.inviteCode });
    assert.equal(
      await db.communityPostVisibleTo(ada.id, mayaPost.posts[0].id),
      false,
      "returning author's old activity stays hidden",
    );

    const createdAt = morningCopy.createdAt;
    const edited = await db.updateGeneralPostForAuthor({
      authorId: ada.id,
      postId: morningCopy.id,
      expectedRevision: 1,
      body: "Thursday track at 6 AM. Rain plan: still on.",
    });
    assert.equal(edited.revision, 2);
    await assert.rejects(
      () => db.updateGeneralPostForAuthor({
        authorId: ada.id,
        postId: morningCopy.id,
        expectedRevision: 1,
        body: "stale",
      }),
      (error) => error.name === "GeneralPostRequestError" && error.statusCode === 409,
    );
    const afterEdit = await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: trackCopy.id,
    });
    assert.equal(afterEdit?.body.includes("Rain plan"), true);
    assert.ok(afterEdit?.editedAt);
    assert.equal(new Date(afterEdit.createdAt).getTime(), new Date(createdAt).getTime());

    const reserved = await db.reserveGeneralPostPhoto({
      authorId: ada.id,
      contentType: "image/jpeg",
      byteSize: 1200,
    });
    await assert.rejects(
      () => db.publishGeneralPost({
        authorId: ada.id,
        publicationId: reserved.publicationId,
        body: "partial",
        groupIds: [morning.id],
        photoIds: [reserved.id],
      }),
      (error) => error.code === "upload_pending",
    );
    await db.completeGeneralPostPhotoReservation({
      authorId: ada.id,
      reservationId: reserved.id,
      uploaded: true,
    });
    const withPhoto = await db.publishGeneralPost({
      authorId: ada.id,
      publicationId: reserved.publicationId,
      body: "photo post",
      groupIds: [morning.id],
      photoIds: [reserved.id],
    });
    assert.equal(withPhoto.posts.length, 1);

    const pinA = await publishPost(db, ada, [morning.id], "Pin me first");
    const pinB = await publishPost(db, ada, [morning.id], "Pin me second");
    const firstPin = await db.pinGeneralPostForOwner({ actorId: ada.id, postId: pinA.posts[0].id });
    assert.equal(firstPin.needsReplaceConfirm, false);
    const blockedReplace = await db.pinGeneralPostForOwner({ actorId: ada.id, postId: pinB.posts[0].id });
    assert.equal(blockedReplace.needsReplaceConfirm, true);
    const replaced = await db.pinGeneralPostForOwner({
      actorId: ada.id,
      postId: pinB.posts[0].id,
      replace: true,
    });
    assert.equal(replaced.needsReplaceConfirm, false);
    await assert.rejects(
      () => db.pinGeneralPostForOwner({ actorId: maya.id, postId: pinB.posts[0].id }),
      (error) => error.statusCode === 403,
    );
    const pinned = await db.getPinnedGeneralPostForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    });
    assert.equal(pinned?.id, pinB.posts[0].id);

    await db.unpinGeneralPostForOwner({ actorId: ada.id, postId: pinB.posts[0].id });
    assert.equal(await db.getPinnedGeneralPostForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    }), null);
    const unpinnedFeed = await db.listCommunityFeedForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    });
    assert.ok(unpinnedFeed.items.some((item) => item.id === pinB.posts[0].id));

    await db.pinGeneralPostForOwner({ actorId: ada.id, postId: pinA.posts[0].id });
    await db.deleteGeneralPostForAuthor({ authorId: ada.id, postId: pinA.posts[0].id });
    assert.equal(await db.getPinnedGeneralPostForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    }), null);
    assert.equal(await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: pinA.posts[0].id,
    }), null);

    const leavePin = await publishPost(db, maya, [morning.id], "Maya pin target");
    await db.pinGeneralPostForOwner({ actorId: ada.id, postId: leavePin.posts[0].id });
    await db.leaveCrew({ userId: maya.id, groupId: morning.id });
    assert.equal(await db.getPinnedGeneralPostForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    }), null);
    await db.joinGroupByInviteCode({ userId: maya.id, inviteCode: morning.inviteCode });
    assert.equal(await db.getPinnedGeneralPostForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
    }), null);

    const openReportPost = await publishPost(db, sam, [morning.id], "Report then erase me");
    const openReport = await db.createContentReportForMember({
      userId: ada.id,
      targetType: "post",
      targetId: openReportPost.posts[0].id,
      reason: "harassment",
    });
    assert.equal(openReport.ok, true);
    await db.deleteUserAccount(sam.id);
    const evidence = await client.query(
      "select author_erased_at, retain_until, snapshot from content_report_evidence where report_id = $1",
      [openReport.report.id],
    );
    assert.equal(evidence.rows.length, 1);
    assert.ok(evidence.rows[0].author_erased_at);
    assert.ok(evidence.rows[0].retain_until);
    assert.equal(evidence.rows[0].snapshot.body, "Report then erase me");
    assert.equal(await db.getGeneralPostDetailForMember({
      viewerUserId: ada.id,
      postId: openReportPost.posts[0].id,
    }), null);

    await client.query(
      "update content_report_evidence set retain_until = now() - interval '1 day' where report_id = $1",
      [openReport.report.id],
    );
    assert.ok(await db.deleteExpiredReportEvidence() >= 1);

    const notifyPost = await publishPost(
      db,
      ada,
      [morning.id, track.id],
      "Push this to current members",
    );
    const recipients = await db.listCrewPostPushRecipients({
      actorUserId: ada.id,
      publicationId: notifyPost.publicationId,
      contentCreatedAt: new Date(notifyPost.posts[0].createdAt),
    });
    assert.ok(recipients.every((row) => row.userId !== ada.id));
    assert.ok(recipients.some((row) => row.userId === maya.id));
    const again = await db.listCrewPostPushRecipients({
      actorUserId: ada.id,
      publicationId: notifyPost.publicationId,
      contentCreatedAt: new Date(notifyPost.posts[0].createdAt),
    });
    assert.deepEqual(again, []);

    await db.setCrewNotificationPrefs({
      userId: maya.id,
      groupId: morning.id,
      prefs: {
        muteAll: false,
        crewPost: false,
        crewWorkout: true,
        crewComment: true,
        crewReaction: true,
      },
    });
    const mutedPrefs = await db.getCrewNotificationPrefs({ userId: maya.id, groupId: morning.id });
    assert.equal(mutedPrefs.crewPost, false);
    assert.equal(await db.crewAlertEnabledForUser({
      userId: maya.id,
      groupId: morning.id,
      alertType: "crew_post",
    }), false);

    const workout = await loggedWorkout(db, ada, morning.id, "Track 400");
    const t3 = new Date(Date.now() + 30_000);
    const t2 = new Date(Date.now() + 20_000);
    const t1 = new Date(Date.now() + 10_000);
    await client.query(
      "update community_posts set created_at = $2 where publication_id = $1",
      [later.publicationId, t3],
    );
    await client.query(
      "update community_posts set created_at = $2 where workout_session_id = $1",
      [workout.id, t2],
    );
    await client.query(
      "update community_posts set created_at = $2 where publication_id = $1",
      [withPhoto.publicationId, t1],
    );
    const mixed = await db.listCommunityFeedForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
      limit: 2,
    });
    assert.equal(mixed.items.length, 2);
    assert.equal(mixed.items[0].kind, "general");
    assert.equal(mixed.items[1].kind, "workout");
    assert.ok(mixed.nextCursor);
    const page2 = await db.listCommunityFeedForMember({
      viewerUserId: ada.id,
      groupId: morning.id,
      cursor: mixed.nextCursor,
      limit: 20,
    });
    assert.ok(page2.items.some((item) => item.kind === "general"));
    assert.ok(page2.items.every((item) => item.id !== mixed.items[0].id && item.id !== mixed.items[1].id));
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

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
    await admin.query("drop database if exists repin_general_posts_test with (force)");
    await admin.query("create database repin_general_posts_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_general_posts_test");
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
