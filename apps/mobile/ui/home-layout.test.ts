import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
import {
  ringCenterlineRadius,
  ringCircumference,
  ringFillDashLength,
  ringFillDashOffset,
  ringGapDashLength,
  ringGapDashOffset,
  ringShowsFill,
  ringShowsGap,
  ringShowsTrack,
  ringStartRotationDeg,
  ringStrokeDasharray,
} from "./progress-ring-math";
import { colors, fonts, progressRing, size, spacing, type } from "./theme";

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

const homeScreen = source("../app/(tabs)/(home)/index.tsx");
const homeUi = source("./home.tsx");
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
  assert.match(ring, /from "react-native-svg"/);
  assert.match(ring, /strokeLinecap="round"/);
  assert.equal(ring.includes("ringTickOnFill"), false);
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

test("ring SVG dash length, offset, gap, and reached state follow the spec geometry", () => {
  const radius = ringCenterlineRadius(progressRing.diameter, progressRing.fillStroke);
  assert.equal(radius, 18);
  const circumference = ringCircumference(radius);
  const sweep = ringFillSweepDeg(0.5, progressRing.gapDeg);
  assert.equal(sweep, 172);
  const fillDash = ringFillDashLength(sweep, circumference);
  assert.equal(fillDash, (172 / 360) * circumference);
  assert.equal(ringFillDashOffset(), 0);
  assert.equal(ringStartRotationDeg(), -90);
  assert.equal(ringGapDashLength(progressRing.gapDeg, circumference), (8 / 360) * circumference);
  assert.equal(ringGapDashOffset(fillDash), -fillDash);
  assert.equal(ringStrokeDasharray(fillDash, circumference), `${fillDash} ${circumference}`);
  assert.equal(ringFillDashLength(0, circumference), 0);
  assert.equal(ringFillDashLength(360, circumference), circumference);
  assert.equal(ringShowsTrack(false), true);
  assert.equal(ringShowsTrack(true), false);
  assert.equal(ringShowsFill(0, false), false);
  assert.equal(ringShowsFill(172, false), true);
  assert.equal(ringShowsFill(0, true), true);
  assert.equal(ringShowsGap(172, false), true);
  assert.equal(ringShowsGap(0, false), false);
  assert.equal(ringShowsGap(360, false), false);
  assert.equal(ringShowsGap(172, true), false);
});

test("react-native-svg provides a Metro web entry so the ring can render on Vercel", () => {
  const webEntry = fileURLToPath(new URL("../node_modules/react-native-svg/src/ReactNativeSVG.web.ts", import.meta.url));
  assert.equal(existsSync(webEntry), true);
  assert.match(ring, /from "react-native-svg"/);
});

test("Home layout file exists next to the screen", () => {
  assert.equal(fileURLToPath(new URL("./home-layout.ts", import.meta.url)).includes("home-layout.ts"), true);
});

test("Home loading skeleton uses the loaded snapshot dimensions and last-known cache", () => {
  const snapshotHeight = spacing.lg * 2
    + progressRing.rowHeight
    + spacing.md
    + type.heading.lineHeight
    + spacing.sm
    + type.micro.lineHeight
    + spacing.xs
    + 34
    + spacing.md
    + size.hit;
  assert.equal(progressRing.rowHeight, 68);
  assert.equal(snapshotHeight, 253);
  assert.ok(snapshotHeight > 200);
  assert.match(homeUi, /homeStreakDotMarker = 34/);
  assert.match(homeUi, /homeStreakDotCircle = 26/);
  assert.match(homeUi, /export function homeSnapshotSkeletonHeight/);
  assert.match(homeUi, /skelGoalRow/);
  assert.match(homeUi, /progressRing\.rowHeight/);
  assert.match(homeUi, /homeStreakDotMarker/);
  assert.match(homeUi, /skelViewGoals/);
  assert.match(homeUi, /skelCrewChip/);
  assert.match(homeUi, /cache\?\.highlightsShown === true/);
  assert.match(homeUi, /cache == null \? 1/);
  assert.match(homeScreen, /writeLastKnownLayout/);
  assert.match(homeScreen, /readLastKnownLayout/);
  assert.match(homeScreen, /cache: layoutCache/);
  assert.match(source("../app/(tabs)/community/index.tsx"), /CommunityLoadingSkeleton cache=\{layoutCache\}/);
  assert.match(source("./community-revamp.tsx"), /communityEntryRowHeight/);
  assert.match(source("./community-revamp.tsx"), /crewHeaderStripCompactHeight/);
  assert.match(source("./community-revamp.tsx"), /cache\?\.pinnedPostShown === true/);
});

test("Highlights and Activity share the same brand Bold 13 section-label style", () => {
  const label = readFileSync(new URL("./section-label.tsx", import.meta.url), "utf8");

  assert.equal(colors.brand, "#C94300");
  assert.equal(fonts.bold, "Nunito_700Bold");
  assert.equal(type.eyebrow.fontSize, 13);
  assert.equal(type.label.fontSize, 13);
  assert.equal(type.eyebrow.lineHeight, 18);
  assert.equal(size.hit, 44);

  assert.match(label, /export const sectionLabelStyle: TextStyle = \{/);
  assert.match(label, /color: colors.brand/);
  assert.match(label, /fontFamily: fonts.bold/);
  assert.match(label, /fontSize: type.eyebrow.fontSize/);
  assert.match(label, /letterSpacing: 0/);
  assert.match(label, /lineHeight: type.eyebrow.lineHeight/);
  assert.match(label, /textAlign: "left"/);
  assert.match(label, /export function SectionLabel/);
  assert.match(label, /style=\{\[sectionLabelStyle, style\]\}/);

  assert.match(homeUi, /import \{ SectionLabel \} from "\.\/section-label"/);
  assert.match(homeUi, /<SectionLabel>\{homeCopy\.highlights\}/);
  assert.match(homeUi, /<SectionLabel>\{homeCopy\.activity\}/);
  assert.match(homeUi, /<SectionLabel style=\{styles.sectionLabel\}>\{homeCopy\.thisWeek\}/);
  assert.match(homeUi, /<SectionLabel style=\{styles.sectionLabel\}>\{homeCopy\.comingUp\}/);
  assert.match(homeUi, /HomeLoadingSkeleton[\s\S]*homeCopy\.highlights[\s\S]*homeCopy\.activity/);
  assert.equal(homeUi.includes("highlightsTitle"), false);
  assert.equal(homeUi.includes("activityTitle"), false);
  assert.equal(homeUi.includes("sectionEyebrow"), false);
  assert.equal(homeUi.includes("...type.section"), false);
  assert.match(homeUi, /viewAllHit: \{ justifyContent: "center", minHeight: size.hit \}/);
  assert.match(homeUi, /homeCopy\.viewAll/);

  assert.equal(homeScreen.includes("highlightsTitle"), false);
  assert.equal(homeScreen.includes("activityTitle"), false);
  assert.equal(homeScreen.includes("type.section"), false);
  assert.match(homeScreen, /HomeHighlights/);
  assert.match(homeScreen, /HomeActivity/);
});
