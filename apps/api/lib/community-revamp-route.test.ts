import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/* eslint-disable @typescript-eslint/no-floating-promises */

const progress = readFileSync(new URL("../app/api/groups/[id]/progress/route.ts", import.meta.url), "utf8");
const highlights = readFileSync(new URL("../app/api/groups/[id]/highlights/route.ts", import.meta.url), "utf8");
const activity = readFileSync(new URL("../app/api/groups/[id]/activity/route.ts", import.meta.url), "utf8");
const postReactions = readFileSync(new URL("../app/api/groups/[id]/posts/[postId]/reactions/route.ts", import.meta.url), "utf8");
const workoutReactions = readFileSync(new URL("../app/api/groups/[id]/workouts/[sessionId]/reactions/route.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/api/home/route.ts", import.meta.url), "utf8");
const dbRevamp = readFileSync(fileURLToPath(new URL("../../../packages/db/src/community-revamp.ts", import.meta.url)), "utf8");
const dbHome = readFileSync(fileURLToPath(new URL("../../../packages/db/src/home.ts", import.meta.url)), "utf8");

test("new crew endpoints 404 non-members and go through membership plus visibility SQL", () => {
  for (const route of [progress, highlights, activity, postReactions, workoutReactions]) {
    assert.match(route, /Crew not found|Post not found|Workout not found/);
    assert.match(route, /status: 404/);
    assert.equal(route.includes("BYPASSRLS"), false);
    assert.equal(route.includes("disable"), false);
  }
  assert.match(progress, /getCrewProgressForMember/);
  assert.match(highlights, /listCrewHighlightsForMember/);
  assert.match(activity, /listCrewActivityForMember/);
  assert.match(postReactions, /listVisibleReactionsForPost/);
  assert.match(workoutReactions, /listVisibleReactionsForPost/);
  assert.match(dbRevamp, /communityPostVisibleToSql/);
  assert.match(dbRevamp, /communityCommentVisibleToSql/);
  assert.match(dbRevamp, /communityReactionVisibleToSql/);
  assert.match(dbRevamp, /requireGroupForMember/);
  assert.equal(dbRevamp.includes("bypassrls"), false);
});

test("Home and Community Highlights share one server definition", () => {
  assert.match(dbHome, /listCrewHighlightsForMember/);
  assert.match(dbHome, /homeHighlightsFromCrew/);
  assert.match(home, /listCrewHighlightsForHome/);
  assert.match(home, /weekEnd: bounds.weekEnd/);
  assert.match(home, /attachFeedSocial/);
  assert.match(home, /getCrewBoardSummary/);
  assert.match(dbRevamp, /countVisibleCrewActivity/);
  assert.match(dbRevamp, /activityCount/);
  assert.match(dbRevamp, /weekPulse/);
  assert.match(dbRevamp, /occurredAt/);
  assert.match(dbRevamp, /HIGHLIGHT_WEEKLY_MIN/);
  assert.equal(dbRevamp.includes("rank"), false);
});
