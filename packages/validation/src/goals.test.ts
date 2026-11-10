import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { durationMinutesError } from "@repin/types";

import {
  createGoalSchema,
  goalChipAccessibility,
  goalCopy,
  parseOptionalDurationMinutes,
  resolvedSchedule,
  resolvedTimeTargetSeconds,
  resolvedVolumeMetric,
} from "./goals";

test("optional duration accepts blank, 1, and 1440, and rejects 0 and fractions", () => {
  assert.deepEqual(parseOptionalDurationMinutes(""), { error: null, value: null });
  assert.deepEqual(parseOptionalDurationMinutes("   "), { error: null, value: null });
  assert.deepEqual(parseOptionalDurationMinutes("1"), { error: null, value: 1 });
  assert.deepEqual(parseOptionalDurationMinutes("1440"), { error: null, value: 1_440 });
  assert.deepEqual(parseOptionalDurationMinutes("0"), { error: durationMinutesError, value: null });
  assert.deepEqual(parseOptionalDurationMinutes("90.5"), { error: durationMinutesError, value: null });
  assert.deepEqual(parseOptionalDurationMinutes("1441"), { error: durationMinutesError, value: null });
});

test("create goal schema requires an IANA zone and volume end date", () => {
  const weekly = createGoalSchema.safeParse({
    kind: "volume",
    metric: "distance",
    sportFilter: "run",
    target: 20,
    displayUnit: "mi",
    schedule: "weekly",
    timeZone: "America/Chicago",
  });
  assert.equal(weekly.success, true);

  const missingZone = createGoalSchema.safeParse({
    kind: "volume",
    metric: "workout_count",
    target: 12,
    schedule: "one_time",
    deadlineAt: "2026-12-31T06:00:00.000Z",
    timeZone: "Not/AZone",
  });
  assert.equal(missingZone.success, false);

  const oneTimeNoEnd = createGoalSchema.safeParse({
    kind: "volume",
    metric: "workout_count",
    target: 12,
    schedule: "one_time",
    timeZone: "America/Chicago",
  });
  assert.equal(oneTimeNoEnd.success, false);

  const timeGoal = createGoalSchema.safeParse({
    kind: "time",
    sportFilter: "run",
    lane: "5k",
    target: 1440,
    targetMinutes: 24,
    targetSeconds: 0,
    timeZone: "America/Chicago",
  });
  assert.equal(timeGoal.success, true);
  if (timeGoal.success) {
    assert.equal(resolvedTimeTargetSeconds(timeGoal.data), 1440);
  }
});

test("canonical copy and mixed chip VoiceOver stay on spec", () => {
  assert.equal(goalCopy.emptyAction, "Set a goal");
  assert.equal(goalCopy.weeklyHelper.startsWith("Sun–Sat"), true);
  assert.equal(goalCopy.shareError, "Couldn't share. Check your connection and try again.");
  assert.equal(goalChipAccessibility.goal(1), "Goal reached");
  assert.equal(goalChipAccessibility.goal(2), "2 goals reached");
  assert.equal(
    goalChipAccessibility.mixed(1, 1),
    "Goal reached and personal record",
  );
  assert.equal(
    goalChipAccessibility.mixed(1, 2),
    "Goal reached and 2 personal records",
  );
  assert.equal(
    goalChipAccessibility.mixed(2, 1),
    "2 goals reached and personal record",
  );
  assert.equal(resolvedVolumeMetric("lift", undefined), "load");
  assert.equal(resolvedSchedule("time", "weekly"), "one_time");
});
