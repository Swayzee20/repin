import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  parseWorkoutWrite,
  WORKOUT_OCCURRED_AT_FUTURE_MESSAGE,
} from "@repin/validation";

const createRoute = readFileSync(new URL("../app/api/groups/[id]/workouts/route.ts", import.meta.url), "utf8");
const editRoute = readFileSync(
  new URL("../app/api/groups/[id]/workouts/[sessionId]/route.ts", import.meta.url),
  "utf8",
);

function workoutBody(occurredAt: string) {
  return {
    workoutType: "run",
    durationMinutes: null,
    effort: 3,
    caption: "Easy miles",
    photoPath: null,
    occurredAt,
    metrics: [],
    movements: [],
  };
}

test("create and edit routes parse with the server clock and return 400 issues", () => {
  for (const route of [createRoute, editRoute]) {
    assert.match(route, /parseWorkoutWrite\(body, new Date\(\)\)/);
    assert.match(route, /error: "Workout details are invalid"/);
    assert.match(route, /issues: input\.error\.issues/);
    assert.match(route, /status: 400/);
    assert.equal(route.includes("createWorkoutSchema.safeParse"), false);
  }
  assert.match(createRoute, /export async function POST/);
  assert.match(editRoute, /export async function PATCH/);
});

test("POST-shaped create accepts today and rejects next week", () => {
  const now = new Date("2020-01-15T18:00:00.000Z");
  const created = parseWorkoutWrite(workoutBody("2020-01-15T18:00:00.000Z"), now);
  assert.equal(created.success, true);

  const future = parseWorkoutWrite(workoutBody("2020-01-22T18:00:00.000Z"), now);
  assert.equal(future.success, false);
  if (!future.success) {
    assert.equal(future.error.issues[0]?.message, WORKOUT_OCCURRED_AT_FUTURE_MESSAGE);
    assert.deepEqual(future.error.issues[0]?.path, ["occurredAt"]);
  }
});

test("PATCH-shaped edit accepts a past date and rejects a future date", () => {
  const now = new Date("2020-01-15T18:00:00.000Z");
  const edited = parseWorkoutWrite(workoutBody("2020-01-10T12:00:00.000Z"), now);
  assert.equal(edited.success, true);

  const future = parseWorkoutWrite(workoutBody("2020-02-01T12:00:00.000Z"), now);
  assert.equal(future.success, false);
  if (!future.success) {
    assert.equal(future.error.issues[0]?.message, WORKOUT_OCCURRED_AT_FUTURE_MESSAGE);
  }
});
