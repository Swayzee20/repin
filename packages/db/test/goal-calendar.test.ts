import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  creditClosesAt,
  currentCalendarPeriod,
  isValidTimeZone,
  sundayWeekBounds,
  zonedLocalToUtc,
  zonedParts,
} from "../src/goal-calendar";
import { nextActiveSlot } from "../src/goal-credit";

test("IANA zones are validated and UTC is not used as a silent fallback", () => {
  assert.equal(isValidTimeZone("America/Chicago"), true);
  assert.equal(isValidTimeZone("Pacific/Kiritimati"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("Sunday weeks stay on the frozen IANA calendar across DST", () => {
  const chicago = "America/Chicago";
  const afterSpringForward = new Date("2026-03-10T18:00:00.000Z");
  const { weekStart, weekEnd } = sundayWeekBounds(afterSpringForward, chicago);
  assert.equal(zonedParts(weekStart, chicago).weekday, 0);
  assert.equal(zonedParts(weekStart, chicago).hour, 0);
  assert.equal(weekEnd.getTime() - weekStart.getTime() !== 7 * 24 * 60 * 60 * 1_000, true);

  const springForward = zonedLocalToUtc(2026, 3, 8, 0, 0, 0, chicago);
  const nextSunday = zonedLocalToUtc(2026, 3, 15, 0, 0, 0, chicago);
  assert.equal(nextSunday.getTime() - springForward.getTime(), 6 * 24 * 60 * 60 * 1_000 + 23 * 60 * 60 * 1_000);
});

test("a late-night Saturday stays in the current Sunday week", () => {
  const tokyo = "Asia/Tokyo";
  const saturdayNight = new Date("2026-11-14T14:59:59.000Z");
  const { weekStart, weekEnd } = sundayWeekBounds(saturdayNight, tokyo);
  assert.equal(saturdayNight >= weekStart && saturdayNight < weekEnd, true);
  const sundayMorning = new Date("2026-11-14T15:00:00.000Z");
  assert.equal(sundayMorning >= weekEnd, true);
});

test("first repeating period uses the current Sunday week with a 7-day grace", () => {
  const zone = "America/Chicago";
  const created = new Date("2026-11-11T16:00:00.000Z");
  const period = currentCalendarPeriod(created, zone, "weekly", null);
  assert.equal(zonedParts(period.start, zone).weekday, 0);
  const close = creditClosesAt(period.end, zone);
  assert.ok(close);
  assert.equal(zonedParts(close, zone).weekday, 0);
});

test("active slots are 1-5 and never invent a sixth", () => {
  assert.equal(nextActiveSlot([]), 1);
  assert.equal(nextActiveSlot([1, 2, 4]), 3);
  assert.equal(nextActiveSlot([1, 2, 3, 4, 5]), null);
});
