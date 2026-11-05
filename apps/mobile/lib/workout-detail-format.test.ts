import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import type {
  WorkoutDetailMetric,
  WorkoutDetailMovement,
  WorkoutDetailSet,
  WorkoutFormatDetail,
} from "@repin/types";

import {
  buildDetailMetricRows,
  formatCyclingAverageSpeed,
  formatEmomIntervalLabel,
  formatFfMovementLine,
  formatFfMovementsHeading,
  formatFormatMetricRows,
  formatSetGroupLabel,
  formatWorkoutSet,
  groupIdenticalConsecutiveSets,
} from "./workout-detail-format";

function metric(partial: Partial<WorkoutDetailMetric> & Pick<WorkoutDetailMetric, "metricType">): WorkoutDetailMetric {
  return {
    id: partial.id ?? partial.metricType,
    label: partial.label ?? null,
    numericValue: partial.numericValue ?? null,
    position: partial.position ?? 0,
    textValue: partial.textValue ?? null,
    unit: partial.unit ?? null,
    ...partial,
  };
}

function set(partial: Partial<WorkoutDetailSet> & Pick<WorkoutDetailSet, "id" | "position">): WorkoutDetailSet {
  return {
    calories: null,
    completed: true,
    distance: null,
    distanceUnit: null,
    durationSeconds: null,
    load: null,
    loadUnit: null,
    notes: null,
    reps: null,
    ...partial,
  };
}

function movement(
  name: string,
  sets: WorkoutDetailSet[],
  extra: Partial<WorkoutDetailMovement> = {},
): WorkoutDetailMovement {
  return {
    id: extra.id ?? name,
    movementId: extra.movementId ?? null,
    movementName: name,
    notes: extra.notes ?? null,
    position: extra.position ?? 0,
    sets,
  };
}

test("SPEC §5 grouped strength sets match mockup 17", () => {
  const squat = [
    set({ id: "s1", load: 225, loadUnit: "lb", position: 0, reps: 5 }),
    set({ id: "s2", load: 225, loadUnit: "lb", position: 1, reps: 5 }),
    set({ id: "s3", load: 225, loadUnit: "lb", position: 2, reps: 5 }),
    set({ id: "s4", load: 225, loadUnit: "lb", position: 3, reps: 5 }),
    set({ id: "s5", load: 225, loadUnit: "lb", position: 4, reps: 5 }),
  ];
  const squatGroups = groupIdenticalConsecutiveSets(squat);
  assert.equal(squatGroups.length, 1);
  assert.equal(formatSetGroupLabel(squatGroups[0]!), "Sets 1–5");
  assert.equal(formatWorkoutSet(squatGroups[0]!.set), "225 lb × 5");

  const bench = [
    set({ id: "b1", load: 135, loadUnit: "lb", position: 0, reps: 8 }),
    set({ id: "b2", load: 160, loadUnit: "lb", position: 1, reps: 5 }),
    set({ id: "b3", load: 160, loadUnit: "lb", position: 2, reps: 5 }),
    set({ id: "b4", load: 160, loadUnit: "lb", position: 3, reps: 5 }),
  ];
  const benchGroups = groupIdenticalConsecutiveSets(bench);
  assert.deepEqual(benchGroups.map(formatSetGroupLabel), ["Set 1", "Sets 2–4"]);
  assert.equal(formatWorkoutSet(benchGroups[0]!.set), "135 lb × 8");
  assert.equal(formatWorkoutSet(benchGroups[1]!.set), "160 lb × 5");
});

test("SPEC §5 FF movement lines match mockups 18–22", () => {
  assert.equal(
    formatFfMovementLine(movement("Pull-Up", [set({ id: "p", position: 0, reps: 5 })])),
    "5 Pull-Up",
  );
  assert.equal(
    formatFfMovementLine(movement("Push-Up", [set({ id: "u", position: 0, reps: 10 })])),
    "10 Push-Up",
  );
  assert.equal(
    formatFfMovementLine(movement("Air Squat", [set({ id: "a", position: 0, reps: 15 })])),
    "15 Air Squat",
  );
  assert.equal(
    formatFfMovementLine(movement("Wall Ball", [set({ id: "w", load: 20, loadUnit: "lb", position: 0, reps: 50 })])),
    "50 Wall Ball · 20 lb",
  );
  assert.equal(
    formatFfMovementLine(movement("Rower", [set({ id: "r", calories: 40, position: 0 })])),
    "40 cal Rower",
  );
  assert.equal(
    formatFfMovementLine(movement("Box Jump", [set({ id: "b", position: 0, reps: 30 })])),
    "30 Box Jump",
  );
  assert.equal(
    formatFfMovementLine(movement("Kettlebell Swing", [set({
      id: "k",
      load: 24,
      loadUnit: "kg",
      position: 0,
      reps: 21,
    })])),
    "21 Kettlebell Swing · 24 kg",
  );
  assert.equal(
    formatFfMovementLine(movement("Run", [set({ id: "run", distance: 400, distanceUnit: "m", position: 0 })])),
    "400 m Run",
  );
  assert.equal(
    formatFfMovementLine(movement("Burpee", [set({ id: "bu", position: 0, reps: 10 })])),
    "10 Burpee",
  );
});

test("EMOM detail uses Min 1 / Min 2 labels and an Each interval heading", () => {
  const emom: WorkoutFormatDetail = {
    durationSeconds: 720,
    intervalSeconds: 60,
    score: null,
    type: "emom",
  };
  assert.equal(formatFfMovementsHeading(emom), "Each interval");
  assert.equal(formatEmomIntervalLabel(0, 60), "Min 1");
  assert.equal(formatEmomIntervalLabel(1, 60), "Min 2");
  assert.equal(formatEmomIntervalLabel(0, 120), "Interval 1");
  assert.equal(formatEmomIntervalLabel(1, 180), "Interval 2");
  assert.deepEqual(formatFormatMetricRows(emom), [
    { label: "Format", value: "EMOM" },
    { label: "Every", value: "1 min" },
    { label: "Workout length", value: "12:00" },
  ]);
});

test("format metric cards match mockups 18–23", () => {
  assert.deepEqual(
    formatFormatMetricRows({
      durationSeconds: 720,
      score: { reps: 5, rounds: 7 },
      type: "amrap",
    }),
    [
      { label: "Format", value: "AMRAP" },
      { label: "Workout length", value: "12:00" },
      { label: "Score", value: "7 rounds + 5 reps" },
    ],
  );
  assert.deepEqual(
    formatFormatMetricRows({
      rounds: null,
      score: { finished: true, timeSeconds: 522 },
      timeCapSeconds: 900,
      type: "for_time",
    }),
    [
      { label: "Format", value: "For Time" },
      { label: "Time cap", value: "15:00" },
      { label: "Finish time", value: "8:42" },
    ],
  );
  assert.deepEqual(
    formatFormatMetricRows({
      rounds: null,
      score: { finished: false, reps: 142 },
      timeCapSeconds: 900,
      type: "for_time",
    }),
    [
      { label: "Format", value: "For Time" },
      { label: "Time cap", value: "15:00" },
      { label: "Result", value: "142 reps · capped" },
    ],
  );
  assert.deepEqual(
    formatFormatMetricRows({
      rounds: 5,
      score: { timeSeconds: 1_100 },
      type: "rounds",
    }),
    [
      { label: "Format", value: "Rounds" },
      { label: "Rounds", value: "5" },
      { label: "Total time", value: "18:20" },
    ],
  );
  assert.equal(formatFfMovementsHeading({ durationSeconds: 720, score: { reps: 5, rounds: 7 }, type: "amrap" }), "Each round");
  assert.equal(formatFfMovementsHeading({
    rounds: null,
    score: { finished: true, timeSeconds: 522 },
    timeCapSeconds: 900,
    type: "for_time",
  }), "Workout");
  assert.equal(formatFfMovementsHeading({ rounds: 5, score: { timeSeconds: 1_100 }, type: "rounds" }), "Each round · same reps");

  const cycling = buildDetailMetricRows({
    format: null,
    metrics: [
      metric({ metricType: "distance", numericValue: 18.2, unit: "mi" }),
      metric({ metricType: "duration", numericValue: 3_930, unit: "seconds" }),
    ],
    workoutType: "cycling",
  });
  assert.deepEqual(cycling, [
    { label: "Distance", value: "18.2 mi" },
    { label: "Time", value: "1:05:30" },
    { label: "Avg speed", value: "16.7 mph" },
  ]);
  assert.equal(
    formatCyclingAverageSpeed([
      metric({ metricType: "distance", numericValue: 18.2, unit: "mi" }),
      metric({ metricType: "duration", numericValue: 3_930, unit: "seconds" }),
    ]),
    "16.7 mph",
  );
});

test("workout-detail renders format cards, grouped sets, and EMOM interval labels", () => {
  const source = readFileSync(new URL("../ui/workout-detail.tsx", import.meta.url), "utf8");
  assert.match(source, /buildDetailMetricRows/);
  assert.match(source, /groupIdenticalConsecutiveSets/);
  assert.match(source, /formatFfMovementLine/);
  assert.match(source, /formatEmomIntervalLabel/);
  assert.match(source, /formatFfMovementsHeading/);
  assert.match(source, /formatSetGroupLabel/);
  assert.equal(source.includes("Set {set.position + 1}"), false);
});
