import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  extractGoalPerformanceCandidates,
  isSessionAdmitted,
  isSessionInPeriod,
  isWorkoutEligibleForGoal,
  qualifyingLiftCandidate,
  qualifyingTimeCandidate,
  sessionDistanceMeters,
  sessionRecordedSeconds,
  sessionVolumeContribution,
  type GoalDefinition,
  type GoalPeriodWindow,
  type GoalSessionSnapshot,
} from "../src/goal-credit";
import { emptyPrMetric, type PrSessionSnapshot } from "../src/pr-detection";

const activation = new Date("2026-11-10T16:00:00.000Z");

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

const volumeGoal: GoalDefinition = {
  kind: "volume",
  metric: "workout_count",
  sportFilter: null,
  targetValue: 3,
  displayUnit: "count",
  prKind: null,
  prKey: null,
  activationAt: activation,
  timeZone: "America/Chicago",
};

const period: GoalPeriodWindow = {
  periodStart: new Date("2026-11-08T06:00:00.000Z"),
  periodEnd: new Date("2026-11-15T06:00:00.000Z"),
  eligibleStart: activation,
  creditClosesAt: new Date("2026-11-22T06:00:00.000Z"),
};

test("admission requires created_at after activation and occurred_at at or after activation", () => {
  assert.equal(
    isSessionAdmitted(session(), { activationAt: activation }, new Date("2026-11-11T00:00:00.000Z")),
    true,
  );
  assert.equal(
    isSessionAdmitted(
      session({ createdAt: new Date("2026-11-09T12:00:00.000Z") }),
      { activationAt: activation },
      new Date("2026-11-11T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isSessionAdmitted(
      session({ occurredAt: new Date("2026-11-09T18:00:00.000Z") }),
      { activationAt: activation },
      new Date("2026-11-11T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isSessionAdmitted(
      session({ createdAt: activation }),
      { activationAt: activation },
      new Date("2026-11-11T00:00:00.000Z"),
    ),
    false,
  );
});

test("grace still requires both gates and never counts future logs", () => {
  const late = session({
    createdAt: new Date("2026-11-16T12:00:00.000Z"),
    occurredAt: new Date("2026-11-14T18:00:00.000Z"),
  });
  assert.equal(isSessionInPeriod(late, period), true);
  assert.equal(
    isWorkoutEligibleForGoal(late, volumeGoal, period, new Date("2026-11-16T13:00:00.000Z")),
    true,
  );
  const afterGrace = session({
    createdAt: new Date("2026-11-22T06:00:00.000Z"),
    occurredAt: new Date("2026-11-14T18:00:00.000Z"),
  });
  assert.equal(isSessionInPeriod(afterGrace, period), false);
  const future = session({
    occurredAt: new Date("2026-11-20T00:00:00.000Z"),
  });
  assert.equal(
    isWorkoutEligibleForGoal(future, volumeGoal, period, new Date("2026-11-11T00:00:00.000Z")),
    false,
  );
});

test("Quick Log without duration still counts once for workout count", () => {
  const quick = session({ durationMinutes: null, metrics: [], segments: [] });
  assert.equal(sessionVolumeContribution(quick, "workout_count"), 1);
  assert.equal(sessionRecordedSeconds(quick), null);
});

test("interval-only distance sums work segments once and session total wins", () => {
  const intervals = session({
    segments: [
      { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 80 },
      { segmentType: "recovery", distance: 200, distanceUnit: "m", durationSeconds: 60 },
      { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 82 },
    ],
  });
  assert.equal(sessionDistanceMeters(intervals), 800);
  const withTotal = session({
    metrics: [{ metricType: "distance", numericValue: 1, unit: "km" }],
    segments: intervals.segments,
  });
  assert.equal(sessionDistanceMeters(withTotal), 1_000);
});

test("time goals require a strictly faster qualifying lane", () => {
  const run: PrSessionSnapshot = {
    id: "s",
    userId: "u",
    occurredAt: new Date("2026-11-10T18:00:00.000Z"),
    workoutType: "run",
    metrics: [
      { metricType: "distance", numericValue: 5, unit: "km" },
      { metricType: "duration", numericValue: 1_199, unit: "s" },
    ],
    movements: [],
  };
  const goal: GoalDefinition = {
    ...volumeGoal,
    kind: "time",
    metric: "time",
    sportFilter: "run",
    targetValue: 1_200,
    prKind: "distance_time",
    prKey: "dt:run:5k",
  };
  const snapshot = session({
    metrics: run.metrics,
  });
  assert.ok(qualifyingTimeCandidate(snapshot, goal));
  assert.equal(
    qualifyingTimeCandidate(session({
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1_200, unit: "s" },
      ],
    }), goal),
    null,
  );
  const candidates = extractGoalPerformanceCandidates({ ...run, createdAt: snapshot.createdAt } as GoalSessionSnapshot);
  assert.equal(candidates[0]?.key, "dt:run:5k");
});

test("lift goals accept any 1-rep at or above the target, including below a lifetime best", () => {
  const lift = session({
    workoutType: "strength_training",
    movements: [{
      id: "m1",
      movementId: null,
      movementName: "Back Squat",
      position: 0,
      sets: [{
        id: "set-1",
        position: 0,
        reps: 1,
        load: 325,
        loadUnit: "lb",
        durationSeconds: null,
        distance: null,
        distanceUnit: null,
        calories: null,
        completed: true,
      }],
    }],
  });
  const goal: GoalDefinition = {
    ...volumeGoal,
    kind: "lift",
    metric: "load",
    targetValue: 147.418,
    prKind: "heaviest_single",
    prKey: "hs:name:back squat",
  };
  assert.ok(qualifyingLiftCandidate(lift, goal));
  const incomplete = session({
    workoutType: "strength_training",
    movements: [{
      id: "m1",
      movementId: null,
      movementName: "Back Squat",
      position: 0,
      sets: [{
        id: "set-1",
        position: 0,
        reps: 1,
        load: 335,
        loadUnit: "lb",
        durationSeconds: null,
        distance: null,
        distanceUnit: null,
        calories: null,
        completed: false,
      }],
    }],
  });
  assert.equal(qualifyingLiftCandidate(incomplete, goal), null);
  assert.equal(emptyPrMetric().loadKg, null);
});

test("incomplete heavier singles are ignored before extracting the qualifying lift", () => {
  const mixed = session({
    workoutType: "strength_training",
    movements: [{
      id: "m1",
      movementId: null,
      movementName: "Back Squat",
      position: 0,
      sets: [
        {
          id: "set-complete",
          position: 0,
          reps: 1,
          load: 315,
          loadUnit: "lb",
          durationSeconds: null,
          distance: null,
          distanceUnit: null,
          calories: null,
          completed: true,
        },
        {
          id: "set-incomplete",
          position: 1,
          reps: 1,
          load: 350,
          loadUnit: "lb",
          durationSeconds: null,
          distance: null,
          distanceUnit: null,
          calories: null,
          completed: false,
        },
      ],
    }],
  });
  const goal: GoalDefinition = {
    ...volumeGoal,
    kind: "lift",
    metric: "load",
    targetValue: 136.078,
    prKind: "heaviest_single",
    prKey: "hs:name:back squat",
  };
  const candidate = qualifyingLiftCandidate(mixed, goal);
  assert.ok(candidate);
  assert.equal(candidate?.sourceSetId, "set-complete");
});
