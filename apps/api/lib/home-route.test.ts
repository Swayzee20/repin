import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { HOME_ACTIVITY_LIMIT } from "@repin/validation";

const route = readFileSync(new URL("../app/api/home/route.ts", import.meta.url), "utf8");
const dbHome = readFileSync(fileURLToPath(new URL("../../../packages/db/src/home.ts", import.meta.url)), "utf8");
const dbGoals = readFileSync(fileURLToPath(new URL("../../../packages/db/src/goals.ts", import.meta.url)), "utf8");

test("home view loads a Home-weight goals read, streak, and server highlights", () => {
  assert.match(route, /listActiveGoalSnapshotsForHome/);
  assert.match(route, /getUserWeeklyStreak/);
  assert.match(route, /listCrewHighlightsForHome/);
  assert.match(route, /HOME_ACTIVITY_LIMIT/);
  assert.equal(HOME_ACTIVITY_LIMIT, 5);
  assert.equal(route.includes("listGoalsForUser"), false);
});

test("home activity is this week's shared posts, not the latest 20", () => {
  assert.match(route, /homeFeed \? HOME_ACTIVITY_LIMIT : 20/);
  assert.match(route, /homeFeed\s*\n\s*\? bounds\.weekStart/);
});

test("crew highlights go through the shared visibility predicate and posts, not other members' sessions", () => {
  assert.match(dbHome, /communityPostVisibleToSql/);
  assert.match(dbHome, /communityPosts/);
  assert.match(dbHome, /workoutSessionId/);
  assert.equal(dbHome.includes("bypassrls"), false);
  assert.match(dbGoals, /listActiveGoalSnapshotsForHome/);
  assert.match(dbGoals, /eq\(schema\.goals\.userId, userId\)/);
  assert.equal(dbGoals.includes("settleUserGoalReads"), true);
  const homeRead = dbGoals.slice(dbGoals.indexOf("listActiveGoalSnapshotsForHome"));
  assert.equal(homeRead.slice(0, 800).includes("settleUserGoalReads"), false);
});
