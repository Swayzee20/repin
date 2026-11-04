import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import type { WorkoutFormatDetail } from "@repin/types";

import { columnsToFormat, createWorkoutSchema, formatToColumns } from "./index";

const occurredAt = "2026-11-04T12:30:00.000Z";

function parseFormat(format: Record<string, unknown>) {
  const result = createWorkoutSchema.safeParse({
    workoutType: "functional_fitness",
    logVersion: 2,
    occurredAt,
    format,
    movements: [
      { movementName: "Pull-Up", sets: [{ reps: 5 }] },
      { movementName: "Push-Up", sets: [{ reps: 10 }] },
    ],
  });
  assert.equal(result.success, true);
  if (!result.success) throw new Error("expected format to parse");
  return result.data.format;
}

function roundTrip(format: WorkoutFormatDetail) {
  return columnsToFormat(formatToColumns(format));
}

test("AMRAP format columns round-trip", () => {
  const format = parseFormat({
    type: "amrap",
    durationSeconds: 1200,
    score: { rounds: 5, reps: 12 },
  });
  assert.ok(format);
  assert.deepEqual(roundTrip(format), {
    type: "amrap",
    durationSeconds: 1200,
    score: { rounds: 5, reps: 12 },
  });
});

test("AMRAP without length round-trips with a null duration", () => {
  const format = parseFormat({
    type: "amrap",
    score: { rounds: 7 },
  });
  assert.ok(format);
  assert.deepEqual(roundTrip(format), {
    type: "amrap",
    durationSeconds: null,
    score: { rounds: 7, reps: 0 },
  });
});

test("For Time finished and capped scores round-trip", () => {
  const finished = parseFormat({
    type: "for_time",
    timeCapSeconds: 900,
    rounds: 3,
    score: { finished: true, timeSeconds: 754 },
  });
  assert.ok(finished);
  assert.deepEqual(roundTrip(finished), {
    type: "for_time",
    timeCapSeconds: 900,
    rounds: 3,
    score: { finished: true, timeSeconds: 754 },
  });

  const capped = parseFormat({
    type: "for_time",
    timeCapSeconds: 900,
    score: { finished: false, reps: 187 },
  });
  assert.ok(capped);
  assert.deepEqual(roundTrip(capped), {
    type: "for_time",
    timeCapSeconds: 900,
    rounds: null,
    score: { finished: false, reps: 187 },
  });
});

test("For Time without a score round-trips", () => {
  const format = parseFormat({
    type: "for_time",
    rounds: 4,
  });
  assert.ok(format);
  assert.deepEqual(roundTrip(format), {
    type: "for_time",
    timeCapSeconds: null,
    rounds: 4,
    score: null,
  });
});

test("EMOM and Rounds format columns round-trip", () => {
  const emom = parseFormat({
    type: "emom",
    durationSeconds: 720,
    intervalSeconds: 120,
    score: null,
  });
  assert.ok(emom);
  assert.deepEqual(roundTrip(emom), {
    type: "emom",
    durationSeconds: 720,
    intervalSeconds: 120,
    score: null,
  });

  const rounds = parseFormat({
    type: "rounds",
    rounds: 5,
    score: { timeSeconds: 1100 },
  });
  assert.ok(rounds);
  assert.deepEqual(roundTrip(rounds), {
    type: "rounds",
    rounds: 5,
    score: { timeSeconds: 1100 },
  });

  const roundsNoTime = parseFormat({
    type: "rounds",
    rounds: 5,
  });
  assert.ok(roundsNoTime);
  assert.deepEqual(roundTrip(roundsNoTime), {
    type: "rounds",
    rounds: 5,
    score: null,
  });
});

test("null format maps to empty columns", () => {
  assert.deepEqual(formatToColumns(null), {
    workoutFormat: null,
    formatDurationSeconds: null,
    formatIntervalSeconds: null,
    formatRounds: null,
    timeCapSeconds: null,
    scoreFinished: null,
    scoreTimeSeconds: null,
    scoreRounds: null,
    scoreReps: null,
  });
  assert.equal(columnsToFormat(formatToColumns(null)), null);
});
