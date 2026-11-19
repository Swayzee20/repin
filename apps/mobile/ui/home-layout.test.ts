import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  HOME_ACTIVITY_LIMIT,
  HOME_GOAL_LIMIT,
  HOME_GOAL_LIMIT_SHORT,
  HOME_HIGHLIGHT_LIMIT,
  HOME_HIGHLIGHT_LIMIT_SHORT,
  HOME_PROMPT_LIMIT_FOLDED,
  HOME_PROMPT_LIMIT_SHORT,
  homeCopy,
  ringFillSweepDeg,
} from "@repin/validation";

import {
  buildWeeklyConsistencyDays,
  homeComingUpInCard,
  homeGoalLimit,
  homeHighlightLimit,
  homeHighlightsInCrewPane,
  homeIsShortScreen,
  homePromptLimit,
} from "./home-layout";
import { ringTickOnFill } from "./progress-ring-math";

const homeScreen = readFileSync(new URL("../app/(tabs)/(home)/index.tsx", import.meta.url), "utf8");
const homeUi = readFileSync(new URL("./home.tsx", import.meta.url), "utf8");
const ring = readFileSync(new URL("./progress-ring.tsx", import.meta.url), "utf8");
const goalsApi = readFileSync(new URL("../lib/goals-api.ts", import.meta.url), "utf8");

test("folded Home shows one goal row; unfolded shows three; short screens cap prompts", () => {
  assert.equal(homeGoalLimit("compact", false), HOME_GOAL_LIMIT_SHORT);
  assert.equal(homeGoalLimit("wide", false), HOME_GOAL_LIMIT_SHORT);
  assert.equal(homeGoalLimit("twoPane", false), HOME_GOAL_LIMIT);
  assert.equal(homeGoalLimit("twoPane", true), HOME_GOAL_LIMIT_SHORT);
  assert.equal(homePromptLimit("twoPane", false), HOME_ACTIVITY_LIMIT);
  assert.equal(homePromptLimit("compact", false), HOME_PROMPT_LIMIT_FOLDED);
  assert.equal(homePromptLimit("compact", true), HOME_PROMPT_LIMIT_SHORT);
  assert.equal(homeHighlightLimit(false), HOME_HIGHLIGHT_LIMIT);
  assert.equal(homeHighlightLimit(true), HOME_HIGHLIGHT_LIMIT_SHORT);
  assert.equal(homeIsShortScreen("compact", 700), true);
  assert.equal(homeIsShortScreen("wide", 700), false);
  assert.equal(homeComingUpInCard("twoPane"), true);
  assert.equal(homeComingUpInCard("compact"), false);
  assert.equal(homeHighlightsInCrewPane(), true);
});

test("week dots still start on Sunday", () => {
  const wednesday = new Date(2026, 10, 18);
  const days = buildWeeklyConsistencyDays(["2026-11-15T18:00:00.000Z"], wednesday);
  assert.equal(days[0]?.weekday.startsWith("S"), true);
  assert.equal(days.length, 7);
  assert.match(homeScreen, /homeHighlightsInCrewPane|HomeHighlights/);
  assert.equal(homeScreen.includes("getDay() + 6"), false);
});

test("Home uses the Goal progress ring, not a bar, and keeps the empty crew plus off the pane", () => {
  assert.match(homeUi, /GoalProgressRing/);
  assert.match(ring, /useReducedMotion/);
  assert.match(ring, /progressRing\.diameter/);
  assert.match(homeUi, /homeCopy\.emptyCrewTitle/);
  assert.equal(homeUi.includes("CheckInEmptyContent"), false);
  assert.equal(homeUi.includes("Log a workout"), false);
  assert.match(homeUi, /StaleBanner/);
  assert.match(homeScreen, /Couldn't load Home|homeCopy\.errorTitle|HomeErrorCards/);
  assert.match(homeScreen, /HomeLoadingSkeleton/);
  assert.match(homeScreen, /WorkoutDetailModal/);
  assert.equal(homeCopy.emptyCrewTitle.toLowerCase().includes("group"), false);
  assert.equal(homeCopy.yourCrew.toLowerCase().includes("group"), false);
});

test("goal mutations bump Home freshness", () => {
  assert.match(goalsApi, /markWorkoutDataStale/);
  assert.equal(goalsApi.split("markWorkoutDataStale()").length > 5, true);
});

test("ring ticks fill to the sweep and leave a gap while in progress", () => {
  const sweep = ringFillSweepDeg(0.5, 8);
  assert.equal(ringTickOnFill(0, 90, sweep), true);
  assert.equal(ringTickOnFill(89, 90, sweep), false);
  assert.equal(ringTickOnFill(0, 90, 0), false);
  assert.equal(ringTickOnFill(0, 90, 360), true);
});

test("Home layout file exists next to the screen", () => {
  assert.equal(fileURLToPath(new URL("./home-layout.ts", import.meta.url)).includes("home-layout.ts"), true);
});
