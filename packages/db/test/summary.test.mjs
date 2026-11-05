import assert from "node:assert/strict";
import { test } from "node:test";

import { formatWorkoutResultSummary } from "../src/workout-result-summary";

test("run distance and duration stay in the current format", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "run",
      metrics: [
        { metricType: "distance", numericValue: 3.2, textValue: null, unit: "mi" },
        { metricType: "duration", numericValue: 1694, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "3.2 mi · 28:14",
  );
});

test("run meters use the stored unit", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "run",
      metrics: [
        { metricType: "distance", numericValue: 800, textValue: null, unit: "m" },
        { metricType: "duration", numericValue: 190, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "800 m · 3:10",
  );
});

test("walk summaries stay distance and duration", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "walk",
      metrics: [
        { metricType: "distance", numericValue: 2, textValue: null, unit: "km" },
        { metricType: "duration", numericValue: 1500, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "2 km · 25:00",
  );
});

test("cycling uses the same distance and duration summary", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "cycling",
      metrics: [
        { metricType: "distance", numericValue: 20.5, textValue: null, unit: "mi" },
        { metricType: "duration", numericValue: 3912, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "20.5 mi · 1:05:12",
  );
});

test("interval run summaries stay grouped", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "run",
      workoutSubtype: "interval",
      metrics: [],
      movements: [],
      segments: [
        { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 90, recoverySeconds: 60 },
        { segmentType: "work", distance: 400, distanceUnit: "m", durationSeconds: 90, recoverySeconds: 60 },
        { segmentType: "work", distance: 200, distanceUnit: "m", durationSeconds: 45, recoverySeconds: null },
      ],
    }),
    "2 × 400 m · 1:30 · +1 more",
  );
});

test("hiit and other stay duration-only", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "hiit",
      metrics: [{ metricType: "duration", numericValue: 1200, textValue: null, unit: "seconds" }],
      movements: [],
    }),
    "20:00",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "other",
      metrics: [{ metricType: "duration", numericValue: 45, textValue: null, unit: "seconds" }],
      movements: [],
    }),
    "0:45",
  );
});

test("AMRAP summaries use length and score", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "amrap",
      formatDurationSeconds: 1200,
      scoreRounds: 5,
      scoreReps: 12,
      metrics: [],
      movements: [],
    }),
    "AMRAP 20 · 5 rounds + 12 reps",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "amrap",
      formatDurationSeconds: 1200,
      scoreRounds: 7,
      scoreReps: 0,
      metrics: [],
      movements: [],
    }),
    "AMRAP 20 · 7 rounds",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "amrap",
      scoreRounds: 1,
      scoreReps: 3,
      metrics: [],
      movements: [],
    }),
    "AMRAP · 1 round + 3 reps",
  );
});

test("For Time summaries cover finished, capped, and no score", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      timeCapSeconds: 900,
      scoreFinished: true,
      scoreTimeSeconds: 754,
      metrics: [],
      movements: [],
    }),
    "For Time · 12:34",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      timeCapSeconds: 900,
      scoreFinished: false,
      scoreReps: 187,
      metrics: [],
      movements: [],
    }),
    "For Time · 187 reps (capped at 15:00)",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      metrics: [],
      movements: [
        { movementName: "Pull-Up", sets: [] },
        { movementName: "Push-Up", sets: [] },
        { movementName: "Sit-Up", sets: [] },
        { movementName: "Squat", sets: [] },
      ],
    }),
    "For Time · 4 movements",
  );
});

test("EMOM summaries use interval labels and movement counts", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "emom",
      formatDurationSeconds: 720,
      formatIntervalSeconds: 60,
      metrics: [],
      movements: [{ movementName: "Wall Ball", sets: [{ reps: 10, load: null, loadUnit: null }] }],
    }),
    "EMOM 12 · 10 Wall Ball",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "emom",
      formatDurationSeconds: 960,
      formatIntervalSeconds: 60,
      metrics: [],
      movements: [
        { movementName: "Wall Ball", sets: [{ reps: 10, load: null, loadUnit: null }] },
        { movementName: "Row", sets: [{ reps: null, load: null, loadUnit: null }] },
        { movementName: "Burpee", sets: [{ reps: 5, load: null, loadUnit: null }] },
      ],
    }),
    "EMOM 16 · 3 movements",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "emom",
      formatDurationSeconds: 1200,
      formatIntervalSeconds: 120,
      metrics: [],
      movements: [
        { movementName: "Clean", sets: [] },
        { movementName: "Jerk", sets: [] },
      ],
    }),
    "E2MOM 20 · 2 movements",
  );
});

test("Rounds summaries use time or movement names", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "rounds",
      formatRounds: 5,
      scoreTimeSeconds: 1100,
      metrics: [],
      movements: [],
    }),
    "5 rounds · 18:20",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "rounds",
      formatRounds: 5,
      metrics: [],
      movements: [
        { movementName: "Pull-Up", sets: [] },
        { movementName: "Push-Up", sets: [] },
        { movementName: "Sit-Up", sets: [] },
      ],
    }),
    "5 rounds · Pull-Up · Push-Up · +1 more",
  );
});

test("legacy functional fitness summaries stay unchanged", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      metrics: [{ metricType: "score", numericValue: null, textValue: "5 rounds + 12 reps", unit: null }],
      movements: [],
    }),
    "5 rounds + 12 reps",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      metrics: [{ metricType: "rounds", numericValue: 8, textValue: null, unit: "rounds" }],
      movements: [],
    }),
    "8 rounds",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      metrics: [{ metricType: "duration", numericValue: 900, textValue: null, unit: "seconds" }],
      movements: [],
    }),
    "15:00",
  );
});

test("single-exercise strength keeps load × reps × sets", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "strength_training",
      metrics: [],
      movements: [{
        movementName: "Bench Press",
        sets: [
          { reps: 5, load: 160, loadUnit: "lb" },
          { reps: 5, load: 160, loadUnit: "lb" },
          { reps: 5, load: 160, loadUnit: "lb" },
        ],
      }],
    }),
    "Bench Press · 160 lb × 5 × 3",
  );
});

test("single-exercise mixed sets stay as a set count", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "powerlifting",
      metrics: [],
      movements: [{
        movementName: "Deadlift",
        sets: [
          { reps: 5, load: 225, loadUnit: "lb" },
          { reps: 3, load: 275, loadUnit: "lb" },
        ],
      }],
    }),
    "Deadlift · 2 sets",
  );
});

test("SPEC §5 feed mockups match D-3 and format summaries", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "strength_training",
      metrics: [],
      movements: [
        {
          movementName: "Back Squat",
          sets: Array.from({ length: 5 }, () => ({ reps: 5, load: 225, loadUnit: "lb" })),
        },
        {
          movementName: "Bench Press",
          sets: [
            { reps: 8, load: 135, loadUnit: "lb" },
            { reps: 5, load: 160, loadUnit: "lb" },
            { reps: 5, load: 160, loadUnit: "lb" },
            { reps: 5, load: 160, loadUnit: "lb" },
          ],
        },
      ],
    }),
    "Back Squat 5×5 · Bench Press 4 sets",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "amrap",
      formatDurationSeconds: 720,
      scoreRounds: 7,
      scoreReps: 5,
      metrics: [],
      movements: [],
    }),
    "AMRAP 12 · 7 rounds + 5 reps",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      scoreFinished: true,
      scoreTimeSeconds: 522,
      metrics: [],
      movements: [],
    }),
    "For Time · 8:42",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "for_time",
      timeCapSeconds: 900,
      scoreFinished: false,
      scoreReps: 142,
      metrics: [],
      movements: [],
    }),
    "For Time · 142 reps (capped at 15:00)",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "emom",
      formatDurationSeconds: 720,
      formatIntervalSeconds: 60,
      metrics: [],
      movements: [
        { movementName: "Kettlebell Swing", sets: [{ reps: 15, load: 24, loadUnit: "kg" }] },
        { movementName: "Burpee", sets: [{ reps: 10, load: null, loadUnit: null }] },
      ],
    }),
    "EMOM 12 · 2 movements",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "functional_fitness",
      workoutFormat: "rounds",
      formatRounds: 5,
      scoreTimeSeconds: 1_100,
      metrics: [],
      movements: [],
    }),
    "5 rounds · 18:20",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "cycling",
      metrics: [
        { metricType: "distance", numericValue: 18.2, textValue: null, unit: "mi" },
        { metricType: "duration", numericValue: 3_930, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "18.2 mi · 1:05:30",
  );
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "run",
      metrics: [
        { metricType: "distance", numericValue: 400, textValue: null, unit: "m" },
        { metricType: "duration", numericValue: 72, textValue: null, unit: "seconds" },
      ],
      movements: [],
    }),
    "400 m · 1:12",
  );
});

test("multi-exercise strength uses NxR, mixed set counts, and +N more", () => {
  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "strength_training",
      metrics: [],
      movements: [
        {
          movementName: "Back Squat",
          sets: Array.from({ length: 5 }, () => ({ reps: 5, load: 225, loadUnit: "lb" })),
        },
        {
          movementName: "Bench Press",
          sets: [
            { reps: 8, load: 135, loadUnit: "lb" },
            { reps: 6, load: 155, loadUnit: "lb" },
            { reps: 5, load: 165, loadUnit: "lb" },
            { reps: 5, load: 165, loadUnit: "lb" },
          ],
        },
      ],
    }),
    "Back Squat 5×5 · Bench Press 4 sets",
  );

  assert.equal(
    formatWorkoutResultSummary({
      workoutType: "strength_training",
      metrics: [],
      movements: [
        {
          movementName: "Back Squat",
          sets: Array.from({ length: 5 }, () => ({ reps: 5, load: 225, loadUnit: "lb" })),
        },
        {
          movementName: "Bench Press",
          sets: Array.from({ length: 4 }, () => ({ reps: 8, load: 135, loadUnit: "lb" })),
        },
        {
          movementName: "Deadlift",
          sets: [{ reps: 1, load: 405, loadUnit: "lb" }],
        },
      ],
    }),
    "Back Squat 5×5 · Bench Press 4×8 · +1 more",
  );
});
