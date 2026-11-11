import assert from "node:assert/strict";
import { test } from "node:test";

import type { GoalSessionSnapshot } from "../src/goal-credit";
import {
  aggregatePeriodStats,
  dashboardSessionContribution,
} from "../src/profile-dashboard-stats";

/* eslint-disable @typescript-eslint/no-floating-promises */

function session(overrides: Partial<GoalSessionSnapshot> = {}): GoalSessionSnapshot {
  return {
    id: "session-1",
    userId: "user-1",
    createdAt: new Date("2026-11-10T17:00:00.000Z"),
    occurredAt: new Date("2026-11-10T18:00:00.000Z"),
    workoutType: "run",
    metrics: [],
    movements: [],
    segments: [],
    durationMinutes: null,
    ...overrides,
  };
}

test("Quick Log without duration counts once and does not invent 0 min", () => {
  const contribution = dashboardSessionContribution(session());
  assert.equal(contribution.recordedSeconds, null);
  assert.equal(contribution.distanceMeters, null);
  const stats = aggregatePeriodStats({
    period: "week",
    start: new Date("2026-11-08T06:00:00.000Z"),
    end: new Date("2026-11-15T06:00:00.000Z"),
    rangeLabel: "Sun Nov 8 – Sat Nov 14",
    contributions: [contribution, contribution],
  });
  assert.equal(stats.workoutCount, 2);
  assert.equal(stats.recordedSeconds, null);
  assert.equal(stats.recordedMeters, null);
  assert.equal(stats.missingDurationCount, 2);
});

test("session distance wins over segment sum and recovery is excluded", () => {
  const withTotal = dashboardSessionContribution(session({
    metrics: [{ metricType: "distance", numericValue: 5, unit: "km" }],
    segments: [
      { segmentType: "work", distance: 1, distanceUnit: "km", durationSeconds: 300 },
      { segmentType: "recovery", distance: 0.4, distanceUnit: "km", durationSeconds: 120 },
    ],
  }));
  assert.equal(withTotal.distanceMeters, 5_000);
  assert.equal(withTotal.distanceUnit, "km");

  const intervals = dashboardSessionContribution(session({
    metrics: [],
    segments: [
      { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 80 },
      { segmentType: "recovery", distance: 100, distanceUnit: "m", durationSeconds: 60 },
      { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 82 },
    ],
  }));
  assert.equal(intervals.distanceMeters, 800);
  assert.equal(intervals.recordedSeconds, 162);
});

test("strength and HIIT are left out of distance totals", () => {
  const lift = dashboardSessionContribution(session({
    workoutType: "strength_training",
    durationMinutes: 48,
    metrics: [{ metricType: "distance", numericValue: 1, unit: "mi" }],
  }));
  assert.equal(lift.recordedSeconds, 48 * 60);
  assert.equal(lift.distanceMeters, null);
});

test("mixed km and miles are converted to meters before rounding", () => {
  const km = dashboardSessionContribution(session({
    metrics: [
      { metricType: "distance", numericValue: 5, unit: "km" },
      { metricType: "duration", numericValue: 1500, unit: "s" },
    ],
  }));
  const miles = dashboardSessionContribution(session({
    metrics: [
      { metricType: "distance", numericValue: 1, unit: "mi" },
      { metricType: "duration", numericValue: 600, unit: "s" },
    ],
  }));
  const missing = dashboardSessionContribution(session({ workoutType: "run" }));
  const stats = aggregatePeriodStats({
    period: "week",
    start: new Date("2026-11-08T06:00:00.000Z"),
    end: new Date("2026-11-15T06:00:00.000Z"),
    rangeLabel: "Sun Nov 8 – Sat Nov 14",
    contributions: [km, miles, missing],
  });
  assert.equal(stats.workoutCount, 3);
  assert.equal(stats.recordedSeconds, 2100);
  assert.ok(stats.recordedMeters);
  assert.equal(Math.round(stats.recordedMeters), 6609);
  assert.equal(stats.missingDurationCount, 1);
  assert.deepEqual(stats.loggedDistanceUnits, ["km", "mi"]);
});

test("AMRAP format length counts as recorded time", () => {
  const amrap = dashboardSessionContribution(session({
    workoutType: "functional_fitness",
    workoutFormat: "amrap",
    formatDurationSeconds: 1200,
  }));
  assert.equal(amrap.recordedSeconds, 1200);
  assert.equal(amrap.distanceMeters, null);
});
