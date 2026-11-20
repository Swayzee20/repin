import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import type { HomeGoalSnapshot } from "@repin/types";

import {
  HOME_RING_LABEL_MAX,
  countWeeklyStreak,
  crewPromptLine,
  daysElapsedInWeek,
  daysRemainingInWeek,
  foldedDeadlineLine,
  formatRelativeShort,
  formatRingNumber,
  highlightRows,
  homeComingUp,
  homeCopy,
  homeGoalRowModel,
  homeStreakLabel,
  isBehindPace,
  nearestPercent,
  ringFillSweepDeg,
  selectHomeGoals,
} from "./home";

const chicago = "America/Chicago";

function volumeGoal(overrides: Partial<HomeGoalSnapshot> = {}): HomeGoalSnapshot {
  return {
    id: "goal-runs",
    title: "4 runs this week",
    kind: "volume",
    metric: "workout_count",
    schedule: "weekly",
    displayUnit: "count",
    targetValue: 4,
    timeZone: chicago,
    deadlineAt: null,
    progress: {
      current: 1,
      target: 4,
      ratio: 0.25,
      label: "1 of 4",
      periodLabel: "this week",
      lastQualifyingLabel: null,
    },
    currentDisplay: 1,
    targetDisplay: 4,
    ...overrides,
  };
}

function milesGoal(current: number, target: number, id = "goal-miles"): HomeGoalSnapshot {
  return volumeGoal({
    id,
    title: "20 miles this week",
    metric: "distance",
    displayUnit: "mi",
    targetValue: target * 1_609.344,
    progress: {
      current: current * 1_609.344,
      target: target * 1_609.344,
      ratio: current / target,
      label: `${current} of ${target} mi`,
      periodLabel: "this week",
      lastQualifyingLabel: null,
    },
    currentDisplay: current,
    targetDisplay: target,
  });
}

test("ring center keeps ratios of 4 characters or fewer and switches to percent after that", () => {
  const fits = homeGoalRowModel(volumeGoal({
    currentDisplay: 3,
    targetDisplay: 4,
    progress: { current: 3, target: 4, ratio: 0.75, label: "3/4", periodLabel: null, lastQualifyingLabel: null },
  }), wednesday());
  assert.equal("3/4".length <= HOME_RING_LABEL_MAX, true);
  assert.equal(fits.centerLabel, "3/4");
  assert.equal(fits.percentMode, false);

  const eightTwenty = homeGoalRowModel(milesGoal(8, 20), wednesday());
  assert.equal("8/20".length, 4);
  assert.equal(eightTwenty.centerLabel, "8/20");
  assert.equal(eightTwenty.percentMode, false);
  assert.equal(eightTwenty.nudge, "Don't fall behind, 12 mi to go");

  const tenTwenty = homeGoalRowModel(milesGoal(10, 20), wednesday());
  assert.equal("10/20".length, 5);
  assert.equal(tenTwenty.centerLabel, "50%");
  assert.equal(tenTwenty.percentMode, true);
  assert.equal(tenTwenty.nudge, "10 of 20 mi, 10 to go");
});

test("volume nudge states follow 0 / behind / 1 left / reached", () => {
  const sunday = new Date("2026-11-15T18:00:00.000Z");
  const zero = homeGoalRowModel(volumeGoal({
    currentDisplay: 0,
    progress: { current: 0, target: 4, ratio: 0, label: "0/4", periodLabel: null, lastQualifyingLabel: null },
  }), sunday);
  assert.equal(zero.centerLabel, "0/4");
  assert.equal(zero.nudge, homeCopy.firstOne);
  assert.equal(zero.accessibilityLabel, "4 runs this week: 0 of 4 done. Get that first one in.");

  const behind = homeGoalRowModel(volumeGoal(), wednesday());
  assert.equal(behind.nudge, "Don't fall behind, 3 to go");
  assert.equal(behind.accessibilityLabel, "4 runs this week: 1 of 4 done, 3 to go. Don't fall behind.");

  const oneLeft = homeGoalRowModel(volumeGoal({
    currentDisplay: 3,
    progress: { current: 3, target: 4, ratio: 0.75, label: "3/4", periodLabel: null, lastQualifyingLabel: null },
  }), wednesday());
  assert.equal(oneLeft.nudge, homeCopy.crushing);
  assert.equal(oneLeft.centerLabel, "3/4");
  assert.equal(oneLeft.accessibilityLabel, "4 runs this week: 3 of 4 done, 1 left. You're crushing it.");

  const reached = homeGoalRowModel(volumeGoal({
    currentDisplay: 4,
    progress: { current: 4, target: 4, ratio: 1, label: "4/4", periodLabel: null, lastQualifyingLabel: null },
  }), wednesday());
  assert.equal(reached.centerLabel, "4/4");
  assert.equal(reached.reached, true);
  assert.equal(reached.nudge, homeCopy.reached);
  assert.equal(reached.accessibilityLabel, "4 runs this week: 4 of 4 done. Goal reached this week.");
});

test("percent-mode number line covers 0, behind, 1 left, and reached", () => {
  const zero = homeGoalRowModel(milesGoal(0, 100), wednesday());
  assert.equal("0/100".length, 5);
  assert.equal(zero.centerLabel, "0%");
  assert.equal(zero.nudge, "0 of 100 mi. Get that first one in");

  const behind = homeGoalRowModel(milesGoal(10, 20), wednesday());
  assert.equal(behind.centerLabel, "50%");
  assert.equal(behind.nudge, "10 of 20 mi, 10 to go");
  assert.equal(
    behind.accessibilityLabel,
    "20 miles this week: 10 of 20 miles done, 10 to go. 50 percent.",
  );

  const oneLeft = homeGoalRowModel(milesGoal(19, 20), wednesday());
  assert.equal(oneLeft.centerLabel, "95%");
  assert.equal(oneLeft.nudge, "You're crushing it. 19 of 20 mi, 1 left");

  const reached = homeGoalRowModel(milesGoal(20, 20), wednesday());
  assert.equal(reached.centerLabel, "100%");
  assert.equal(reached.nudge, "20 of 20 mi. Goal reached this week");
});

test("time and lift goals show a percent and have no nudge", () => {
  const time = homeGoalRowModel({
    id: "goal-5k",
    title: "Sub-24 5K",
    kind: "time",
    metric: "time",
    schedule: "one_time",
    displayUnit: null,
    targetValue: 24 * 60,
    timeZone: chicago,
    deadlineAt: "2026-12-01T06:00:00.000Z",
    progress: {
      current: 0,
      target: 24 * 60,
      ratio: 0.72,
      label: "72%",
      periodLabel: null,
      lastQualifyingLabel: null,
    },
    currentDisplay: 0,
    targetDisplay: 24 * 60,
  }, wednesday());
  assert.equal(time.centerLabel, "72%");
  assert.equal(time.nudge, null);
  assert.equal(time.accessibilityLabel, "Sub-24 5K: 72 percent. No nudge.");
});

test("Sunday with 0 done uses the first-one nudge, not behind pace", () => {
  const sunday = new Date("2026-11-15T18:00:00.000Z");
  assert.equal(daysElapsedInWeek(sunday, chicago), 1);
  assert.equal(isBehindPace(0, 4, 1), true);
  const row = homeGoalRowModel(volumeGoal({
    currentDisplay: 0,
    progress: { current: 0, target: 4, ratio: 0, label: "0/4", periodLabel: null, lastQualifyingLabel: null },
  }), sunday);
  assert.equal(row.nudge, homeCopy.firstOne);
});

test("Wednesday is 4 days elapsed and 3 days remaining", () => {
  const now = wednesday();
  assert.equal(daysElapsedInWeek(now, chicago), 4);
  assert.equal(daysRemainingInWeek(now, chicago), 3);
  assert.equal(isBehindPace(8, 20, 3), true);
  assert.equal(isBehindPace(8, 20, 4), true);
});

test("week-end deadline shows only when behind and 1-3 days remain", () => {
  const runs = homeGoalRowModel(volumeGoal(), wednesday());
  const coming = homeComingUp({
    goals: [volumeGoal(), raceGoal()],
    displayed: [runs],
    now: wednesday(),
    timeZone: chicago,
  });
  assert.equal(coming.weekEndLine, "3 days left this week");
  assert.equal(coming.deadline?.title, "5K race");
  assert.equal(coming.deadline?.weekday, "Fri");
  assert.deepEqual(foldedDeadlineLine(coming), {
    left: "3 days left this week",
    right: "5K race · Fri",
  });

  const sunday = homeComingUp({
    goals: [volumeGoal()],
    displayed: [homeGoalRowModel(volumeGoal({
      currentDisplay: 0,
      progress: { current: 0, target: 4, ratio: 0, label: "0/4", periodLabel: null, lastQualifyingLabel: null },
    }), new Date("2026-11-15T18:00:00.000Z"))],
    now: new Date("2026-11-15T18:00:00.000Z"),
    timeZone: chicago,
  });
  assert.equal(sunday.weekEndLine, null);
});

test("goal order is weekly, then one-time due within 7 days, then monthly", () => {
  const monthly = volumeGoal({ id: "monthly", schedule: "monthly", title: "Monthly" });
  const weekly = volumeGoal({ id: "weekly", title: "Weekly" });
  const soon = raceGoal();
  const later = raceGoal({
    id: "later",
    title: "Far race",
    deadlineAt: "2027-03-01T06:00:00.000Z",
  });
  assert.deepEqual(
    selectHomeGoals([later, monthly, soon, weekly], wednesday(), 3).map((goal) => goal.id),
    ["weekly", "race", "monthly"],
  );
});

test("streak copy is neutral at 0 and counts consecutive Sunday weeks", () => {
  assert.equal(homeStreakLabel(0), "No streak yet");
  assert.equal(homeStreakLabel(4), "4-week streak");
  assert.equal(countWeeklyStreak(["2026-11-16", "2026-11-09", "2026-11-02", "2026-10-26"], "2026-11-16"), 4);
  assert.equal(countWeeklyStreak(["2026-11-09", "2026-11-02", "2026-10-26"], "2026-11-16"), 3);
  assert.equal(countWeeklyStreak(["2026-11-16", "2026-11-02"], "2026-11-16"), 1);
  assert.equal(countWeeklyStreak([], "2026-11-16"), 0);
});

test("crew prompt copy and highlight rows match the board", () => {
  const now = new Date("2026-11-18T21:41:00.000Z");
  assert.equal(
    crewPromptLine({
      displayName: "Maya L.",
      resultSummary: "4.0 mi",
      title: "Easy shakeout",
      workoutType: "run",
      occurredAt: "2026-11-18T19:41:00.000Z",
      completedAt: "2026-11-18T19:41:00.000Z",
    }, now),
    "Maya logged 4.0 mi run · 2h",
  );
  assert.equal(formatRelativeShort(new Date("2026-11-17T21:41:00.000Z"), now), "1d");
  const rows = highlightRows({
    firstToRepInToday: { userId: "maya", displayName: "Maya L." },
    weekly: [{ userId: "maya", displayName: "Maya L.", count: 3 }],
    limit: 3,
  });
  assert.equal(rows[0]?.kind, "first");
  assert.equal(rows[1]?.kind, "count");
  assert.equal(homeCopy.reppedInAtLeast("Maya", 3), "Maya repped in at least 3 times this week");
  assert.equal(homeCopy.emptyCrewTitle.includes("group"), false);
  assert.equal(homeCopy.yourCrew.includes("GROUP"), false);
});

test("ring fill leaves an 8 degree surface gap while in progress", () => {
  assert.equal(ringFillSweepDeg(0, 8), 0);
  assert.equal(ringFillSweepDeg(1, 8), 360);
  assert.equal(ringFillSweepDeg(0.5, 8), 172);
  assert.equal(nearestPercent(0.5), 50);
  assert.equal(formatRingNumber(8), "8");
  assert.equal(formatRingNumber(8.5), "8.5");
});

function wednesday() {
  return new Date("2026-11-18T21:41:00.000Z");
}

function raceGoal(overrides: Partial<HomeGoalSnapshot> = {}): HomeGoalSnapshot {
  return {
    id: "race",
    title: "5K race",
    kind: "time",
    metric: "time",
    schedule: "one_time",
    displayUnit: null,
    targetValue: 1500,
    timeZone: chicago,
    deadlineAt: "2026-11-21T06:00:00.000Z",
    progress: {
      current: 0,
      target: 1500,
      ratio: 0,
      label: "0%",
      periodLabel: "Fri",
      lastQualifyingLabel: null,
    },
    currentDisplay: 0,
    targetDisplay: 1500,
    ...overrides,
  };
}
