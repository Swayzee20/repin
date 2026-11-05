import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { workoutTypes } from "@repin/types";

import {
  createWorkoutSchema,
  movementLastSessionQuerySchema,
  movementSearchQuerySchema,
} from "./index";

const occurredAt = "2026-11-04T12:30:00.000Z";

function parseWorkout(body: unknown) {
  return createWorkoutSchema.safeParse(body);
}

function validWorkout(overrides: Record<string, unknown> = {}) {
  return {
    workoutType: "run",
    durationMinutes: null,
    effort: 3,
    caption: "Felt good",
    photoPath: null,
    occurredAt,
    metrics: [],
    movements: [],
    ...overrides,
  };
}

test("workoutTypes stay in the approved order with cycling after walk", () => {
  assert.deepEqual([...workoutTypes], [
    "run",
    "walk",
    "cycling",
    "strength_training",
    "powerlifting",
    "hiit",
    "functional_fitness",
    "other",
  ]);
});

test("the current TestFlight quick-log body still parses", () => {
  const result = parseWorkout({
    workoutType: "run",
    durationMinutes: null,
    effort: 3,
    caption: "Easy miles",
    photoPath: null,
    occurredAt,
    metrics: [],
    movements: [],
    notes: "Easy miles",
    completedAt: occurredAt,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.workoutType, "run");
  assert.equal(result.data.caption, "Easy miles");
  assert.equal(result.data.logVersion, null);
  assert.equal(result.data.format, null);
  assert.deepEqual(result.data.metrics, []);
  assert.deepEqual(result.data.movements, []);
});

test("the current TestFlight detailed run body still parses", () => {
  const result = parseWorkout({
    workoutType: "run",
    workoutSubtype: "distance",
    name: "Saturday tempo",
    durationMinutes: 28,
    effort: 3,
    caption: "Legs felt great today",
    photoPath: null,
    occurredAt,
    metrics: [
      { metricType: "distance", numericValue: 3.2, unit: "mi" },
      { metricType: "duration", numericValue: 1694, unit: "seconds" },
    ],
    movements: [],
    segments: [],
    title: "Saturday tempo",
    notes: "Legs felt great today",
    completedAt: occurredAt,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.workoutSubtype, "distance");
  assert.equal(result.data.durationMinutes, 28);
  assert.equal(result.data.metrics[0]?.unit, "mi");
});

test("the current TestFlight detailed strength body still parses", () => {
  const result = parseWorkout({
    workoutType: "strength_training",
    workoutSubtype: null,
    name: "",
    durationMinutes: null,
    effort: 4,
    caption: "",
    photoPath: null,
    occurredAt,
    metrics: [],
    movements: [
      {
        movementId: null,
        movementName: "Bench Press",
        sets: [
          { reps: 5, load: 160, loadUnit: "lb" },
          { reps: 5, load: 160, loadUnit: "lb" },
          { reps: 5, load: 160, loadUnit: "lb" },
        ],
      },
    ],
    segments: [],
    title: "Strength Training",
    notes: "",
    completedAt: occurredAt,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.movements[0]?.sets.length, 3);
  assert.deepEqual(result.data.movements[0]?.sets[0], {
    reps: 5,
    load: 160,
    loadUnit: "lb",
  });
});

test("the current TestFlight interval run body still parses", () => {
  const result = parseWorkout({
    workoutType: "run",
    workoutSubtype: "interval",
    name: "Track night",
    durationMinutes: null,
    effort: 5,
    caption: "",
    photoPath: null,
    occurredAt,
    metrics: [],
    movements: [],
    segments: [
      {
        position: 0,
        segmentType: "work",
        distance: 400,
        distanceUnit: "m",
        durationSeconds: 90,
        recoverySeconds: 60,
      },
    ],
    title: "Track night",
    notes: "",
    completedAt: occurredAt,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.segments[0]?.distanceUnit, "m");
});

test("cycling accepts distance and duration, including meters", () => {
  const result = parseWorkout(validWorkout({
    workoutType: "cycling",
    metrics: [
      { metricType: "distance", numericValue: 800, unit: "m" },
      { metricType: "duration", numericValue: 3912, unit: "seconds" },
    ],
  }));

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.workoutType, "cycling");
  assert.equal(result.data.durationMinutes, 65);
});

test("run and walk accept an m distance unit", () => {
  for (const workoutType of ["run", "walk"] as const) {
    const result = parseWorkout(validWorkout({
      workoutType,
      metrics: [{ metricType: "distance", numericValue: 800, unit: "m" }],
    }));
    assert.equal(result.success, true, workoutType);
    if (result.success) assert.equal(result.data.metrics[0]?.unit, "m");
  }
});

test("distance units km and mi stay valid and yd is rejected", () => {
  assert.equal(parseWorkout(validWorkout({
    metrics: [{ metricType: "distance", numericValue: 5, unit: "km" }],
  })).success, true);
  assert.equal(parseWorkout(validWorkout({
    metrics: [{ metricType: "distance", numericValue: 3.1, unit: "mi" }],
  })).success, true);
  assert.equal(parseWorkout(validWorkout({
    metrics: [{ metricType: "distance", numericValue: 400, unit: "yd" }],
  })).success, false);
});

test("set count expands into identical rows and rejects 21", () => {
  const expanded = parseWorkout(validWorkout({
    workoutType: "strength_training",
    movements: [
      {
        movementName: "Back Squat",
        sets: [{ reps: 5, load: 225, loadUnit: "lb", count: 5 }],
      },
    ],
  }));

  assert.equal(expanded.success, true);
  if (!expanded.success) return;
  assert.equal(expanded.data.movements[0]?.sets.length, 5);
  assert.ok(expanded.data.movements[0]?.sets.every((set: { reps?: number | null; load?: number | null; loadUnit?: string | null }) => (
    set.reps === 5 && set.load === 225 && set.loadUnit === "lb"
  )));

  assert.equal(parseWorkout(validWorkout({
    workoutType: "strength_training",
    movements: [
      {
        movementName: "Back Squat",
        sets: [{ reps: 5, load: 225, loadUnit: "lb", count: 1 }],
      },
    ],
  })).success, true);

  assert.equal(parseWorkout(validWorkout({
    workoutType: "strength_training",
    movements: [
      {
        movementName: "Back Squat",
        sets: [{ reps: 5, load: 225, loadUnit: "lb", count: 20 }],
      },
    ],
  })).success, true);

  assert.equal(parseWorkout(validWorkout({
    workoutType: "strength_training",
    movements: [
      {
        movementName: "Back Squat",
        sets: [{ reps: 5, load: 225, loadUnit: "lb", count: 21 }],
      },
    ],
  })).success, false);
});

test("custom movement names trim and collapse whitespace", () => {
  const result = parseWorkout(validWorkout({
    workoutType: "powerlifting",
    movements: [
      {
        movementName: "  Sandbag   Over  Shoulder  ",
        sets: [{ reps: 3 }],
      },
    ],
  }));

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.movements[0]?.movementName, "Sandbag Over Shoulder");
});

test("logVersion is accepted and passed through", () => {
  const result = parseWorkout(validWorkout({ logVersion: 2 }));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.logVersion, 2);
});

test("an omitted logVersion is accepted as null so old builds still parse", () => {
  const result = parseWorkout(validWorkout());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.logVersion, null);
});

test("movement search accepts recent=true", () => {
  const withRecent = movementSearchQuerySchema.safeParse({ q: "bench", recent: "true" });
  assert.equal(withRecent.success, true);
  if (withRecent.success) {
    assert.equal(withRecent.data.q, "bench");
    assert.equal(withRecent.data.recent, true);
  }

  const withoutRecent = movementSearchQuerySchema.safeParse({ q: "" });
  assert.equal(withoutRecent.success, true);
  if (withoutRecent.success) assert.equal(withoutRecent.data.recent, false);
});

function formatWorkout(format: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return validWorkout({
    workoutType: "functional_fitness",
    logVersion: 2,
    format,
    movements: [
      { movementName: "Pull-Up", sets: [{ reps: 5 }] },
      { movementName: "Push-Up", sets: [{ reps: 10 }] },
    ],
    ...overrides,
  });
}

test("AMRAP accepts a score and optional length", () => {
  const result = parseWorkout(formatWorkout({
    type: "amrap",
    durationSeconds: 1200,
    score: { rounds: 5, reps: 12 },
  }));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.format, {
    type: "amrap",
    durationSeconds: 1200,
    score: { rounds: 5, reps: 12 },
  });
  assert.equal(result.data.durationMinutes, 20);
});

test("AMRAP extra reps default to 0 and reps without rounds are rejected", () => {
  const withoutReps = parseWorkout(formatWorkout({
    type: "amrap",
    durationSeconds: 1200,
    score: { rounds: 7 },
  }));
  assert.equal(withoutReps.success, true);
  if (withoutReps.success) {
    assert.deepEqual(withoutReps.data.format, {
      type: "amrap",
      durationSeconds: 1200,
      score: { rounds: 7, reps: 0 },
    });
  }

  assert.equal(parseWorkout(formatWorkout({
    type: "amrap",
    durationSeconds: 1200,
    score: { reps: 12 },
  })).success, false);
});

test("AMRAP length is optional at the API", () => {
  const result = parseWorkout(formatWorkout({
    type: "amrap",
    score: { rounds: 1, reps: 3 },
  }));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.format?.type, "amrap");
  if (result.data.format?.type === "amrap") {
    assert.equal(result.data.format.durationSeconds, null);
  }
  assert.equal(result.data.durationMinutes, null);
});

test("For Time finished and capped scores validate the cap", () => {
  const finished = parseWorkout(formatWorkout({
    type: "for_time",
    timeCapSeconds: 900,
    rounds: 3,
    score: { finished: true, timeSeconds: 754 },
  }));
  assert.equal(finished.success, true);
  if (finished.success) assert.equal(finished.data.durationMinutes, 13);

  const noCap = parseWorkout(formatWorkout({
    type: "for_time",
    score: { finished: true, timeSeconds: 754 },
  }));
  assert.equal(noCap.success, true);

  const capped = parseWorkout(formatWorkout({
    type: "for_time",
    timeCapSeconds: 900,
    score: { finished: false, reps: 187 },
  }));
  assert.equal(capped.success, true);
  if (capped.success) assert.equal(capped.data.durationMinutes, 15);

  assert.equal(parseWorkout(formatWorkout({
    type: "for_time",
    timeCapSeconds: 900,
    score: { finished: true, timeSeconds: 901 },
  })).success, false);
  assert.equal(parseWorkout(formatWorkout({
    type: "for_time",
    score: { finished: false, reps: 187 },
  })).success, false);
});

test("EMOM and Rounds use their own schemas", () => {
  const emom = parseWorkout(formatWorkout({
    type: "emom",
    durationSeconds: 720,
    intervalSeconds: 60,
    score: null,
  }));
  assert.equal(emom.success, true);
  if (emom.success) {
    assert.deepEqual(emom.data.format, {
      type: "emom",
      durationSeconds: 720,
      intervalSeconds: 60,
      score: null,
    });
    assert.equal(emom.data.durationMinutes, 12);
  }

  const rounds = parseWorkout(formatWorkout({
    type: "rounds",
    rounds: 5,
    score: { timeSeconds: 1100 },
  }));
  assert.equal(rounds.success, true);
  if (rounds.success) assert.equal(rounds.data.durationMinutes, 19);

  const roundsNoTime = parseWorkout(formatWorkout({
    type: "rounds",
    rounds: 5,
  }));
  assert.equal(roundsNoTime.success, true);
});

test("format is rejected on a non-FF type and with metrics", () => {
  assert.equal(parseWorkout(validWorkout({
    workoutType: "run",
    format: { type: "amrap", score: { rounds: 5, reps: 0 } },
    movements: [{ movementName: "Pull-Up", sets: [{ reps: 5 }] }],
  })).success, false);

  assert.equal(parseWorkout(formatWorkout({
    type: "amrap",
    score: { rounds: 5, reps: 0 },
  }, {
    metrics: [{ metricType: "duration", numericValue: 600, unit: "seconds" }],
  })).success, false);
});

test("format workouts require 1-20 movements and accept set distance calories and duration", () => {
  assert.equal(parseWorkout(validWorkout({
    workoutType: "functional_fitness",
    format: { type: "amrap", score: { rounds: 5, reps: 0 } },
    movements: [],
  })).success, false);

  const withDistance = parseWorkout(formatWorkout({
    type: "amrap",
    score: { rounds: 5, reps: 0 },
  }, {
    movements: [{
      movementName: "Run",
      sets: [{ distance: 400, distanceUnit: "m" }],
    }],
  }));
  assert.equal(withDistance.success, true);

  assert.equal(parseWorkout(formatWorkout({
    type: "amrap",
    score: { rounds: 5, reps: 0 },
  }, {
    movements: [{
      movementName: "Run",
      sets: [{ distance: 400 }],
    }],
  })).success, false);
});

test("legacy functional fitness still rejects movements and stays metrics-only", () => {
  assert.equal(parseWorkout(validWorkout({
    workoutType: "functional_fitness",
    metrics: [{ metricType: "score", textValue: "5 rounds + 12 reps" }],
    movements: [{ movementName: "Pull-Up", sets: [{ reps: 5 }] }],
  })).success, false);

  const legacy = parseWorkout(validWorkout({
    workoutType: "functional_fitness",
    metrics: [{ metricType: "score", textValue: "5 rounds + 12 reps" }],
  }));
  assert.equal(legacy.success, true);
  if (legacy.success) assert.equal(legacy.data.format, null);
});

test("last-session query requires movementId or movementName", () => {
  const movementId = "11111111-1111-4111-8111-111111111111";
  const byId = movementLastSessionQuerySchema.safeParse({ movementId });
  assert.equal(byId.success, true);

  const byName = movementLastSessionQuerySchema.safeParse({ movementName: "landmine" });
  assert.equal(byName.success, true);
  if (byName.success) assert.equal(byName.data.movementName, "landmine");

  assert.equal(movementLastSessionQuerySchema.safeParse({}).success, false);
  assert.equal(movementLastSessionQuerySchema.safeParse({
    movementId,
    movementName: "landmine",
  }).success, false);
});
