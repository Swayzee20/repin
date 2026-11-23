import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { exclusiveDeadlineAtEndOfLocalDay } from "./calendar";
import {
  WORKOUT_OCCURRED_AT_CLOCK_SKEW_MS,
  WORKOUT_OCCURRED_AT_LATEST_ZONE,
  isoDatetimeOffsetMinutesEastOfUtc,
  isWorkoutOccurredAtAllowed,
} from "./workout-occurred-at";

const kiritimatiMidnight = new Date("2026-11-22T10:00:00.000Z");

test("past timestamps are allowed", () => {
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-04T12:30:00.000Z", kiritimatiMidnight),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-21T23:59:59.000Z", kiritimatiMidnight),
    true,
  );
});

test("now is allowed", () => {
  assert.equal(
    isWorkoutOccurredAtAllowed(kiritimatiMidnight.toISOString(), kiritimatiMidnight),
    true,
  );
});

test("a few minutes of clock skew are allowed", () => {
  const skew = new Date(kiritimatiMidnight.getTime() + 2 * 60_000);
  assert.equal(isWorkoutOccurredAtAllowed(skew.toISOString(), kiritimatiMidnight), true);
  const atLimit = new Date(kiritimatiMidnight.getTime() + WORKOUT_OCCURRED_AT_CLOCK_SKEW_MS);
  assert.equal(isWorkoutOccurredAtAllowed(atLimit.toISOString(), kiritimatiMidnight), true);
});

test("a date next week is rejected", () => {
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-29T12:00:00.000Z", kiritimatiMidnight),
    false,
  );
});

test("Z timestamps may use the rest of the UTC+14 local day", () => {
  const endOfKiritimatiDay = exclusiveDeadlineAtEndOfLocalDay(
    kiritimatiMidnight,
    WORKOUT_OCCURRED_AT_LATEST_ZONE,
  );
  assert.equal(endOfKiritimatiDay.toISOString(), "2026-11-23T10:00:00.000Z");
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-23T09:59:59.000Z", kiritimatiMidnight),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed(endOfKiritimatiDay.toISOString(), kiritimatiMidnight),
    false,
  );
});

test("Los Angeles today at 11:59 PM still fits the UTC+14 bound when sent as Z", () => {
  const laMorning = new Date("2026-11-22T18:00:00.000Z");
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-23T07:59:00.000Z", laMorning),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-23T18:00:00.000Z", laMorning),
    false,
  );
});

test("a numeric offset uses that local day instead of UTC+14", () => {
  const laMorning = new Date("2026-11-22T18:00:00.000Z");
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-22T23:59:00.000-08:00", laMorning),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-23T00:01:00.000-08:00", laMorning),
    false,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-23T23:59:00.000+14:00", kiritimatiMidnight),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed("2026-11-24T00:00:00.000+14:00", kiritimatiMidnight),
    false,
  );
});

test("clock skew still covers now across the UTC+14 day boundary", () => {
  const justBeforeMidnight = new Date("2026-11-23T09:58:00.000Z");
  const twoMinutesIntoNextDay = new Date("2026-11-23T10:02:00.000Z");
  const sixMinutesAhead = new Date("2026-11-23T10:04:00.000Z");
  assert.equal(
    isWorkoutOccurredAtAllowed(twoMinutesIntoNextDay.toISOString(), justBeforeMidnight),
    true,
  );
  assert.equal(
    isWorkoutOccurredAtAllowed(sixMinutesAhead.toISOString(), justBeforeMidnight),
    false,
  );
});

test("Z is an unknown zone and numeric offsets parse east of UTC", () => {
  assert.equal(isoDatetimeOffsetMinutesEastOfUtc("2026-11-22T12:00:00.000Z"), null);
  assert.equal(isoDatetimeOffsetMinutesEastOfUtc("2026-11-22T12:00:00.000+14:00"), 14 * 60);
  assert.equal(isoDatetimeOffsetMinutesEastOfUtc("2026-11-22T12:00:00.000-08:00"), -8 * 60);
  assert.equal(isoDatetimeOffsetMinutesEastOfUtc("2026-11-22T12:00:00.000+13:45"), 13 * 60 + 45);
});
