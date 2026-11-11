import assert from "node:assert/strict";
import { test } from "node:test";

import { monthBounds, sundayWeekBounds, zonedLocalToUtc, zonedParts } from "./calendar";
import { homeQuerySchema } from "./index";
import {
  decodeWorkoutCursor,
  encodeWorkoutCursor,
  formatDashboardDistance,
  formatMonthRangeLabel,
  formatRecordedDuration,
  formatTotalsDistance,
  formatTotalsTime,
  formatWeekRangeLabel,
  homeLocalBounds,
  identityThisWeekLabel,
  inclusiveDateRangeBounds,
  profileDashboardCopy,
  timeZoneDisplayName,
  totalsCoverageLine,
  totalsEmptyLabel,
  totalsHelpParagraphs,
  type TotalsCoverageInput,
} from "./profile-dashboard";

/* eslint-disable @typescript-eslint/no-floating-promises */

test("IANA Sunday weeks stay Sunday-to-Saturday across Chicago DST", () => {
  const zone = "America/Chicago";
  const afterSpring = new Date("2026-03-10T18:00:00.000Z");
  const { weekStart, weekEnd } = sundayWeekBounds(afterSpring, zone);
  assert.equal(zonedParts(weekStart, zone).weekday, 0);
  assert.equal(zonedParts(weekStart, zone).hour, 0);
  assert.equal(zonedParts(addLast(weekEnd), zone).weekday, 6);
  assert.notEqual(weekEnd.getTime() - weekStart.getTime(), 7 * 24 * 60 * 60 * 1_000);

  const springSunday = zonedLocalToUtc(2026, 3, 8, 0, 0, 0, zone);
  const nextSunday = zonedLocalToUtc(2026, 3, 15, 0, 0, 0, zone);
  assert.equal(
    nextSunday.getTime() - springSunday.getTime(),
    6 * 24 * 60 * 60 * 1_000 + 23 * 60 * 60 * 1_000,
  );
});

test("fall-back DST week is longer than 168 hours", () => {
  const zone = "America/Chicago";
  const afterFallBack = new Date("2026-11-02T18:00:00.000Z");
  const { weekStart, weekEnd } = sundayWeekBounds(afterFallBack, zone);
  assert.equal(zonedParts(weekStart, zone).weekday, 0);
  assert.ok(weekEnd.getTime() - weekStart.getTime() > 7 * 24 * 60 * 60 * 1_000);
});

test("Home IANA bounds match Profile Sunday weeks and do not use 7×24h offset math", () => {
  const now = new Date("2026-03-10T18:00:00.000Z");
  const iana = homeLocalBounds(now, { timeZone: "America/Chicago" });
  const offset = homeLocalBounds(now, { timezoneOffsetMinutes: 300 });
  assert.deepEqual(
    { start: iana.weekStart.toISOString(), end: iana.weekEnd.toISOString() },
    {
      start: sundayWeekBounds(now, "America/Chicago").weekStart.toISOString(),
      end: sundayWeekBounds(now, "America/Chicago").weekEnd.toISOString(),
    },
  );
  assert.notEqual(iana.weekStart.toISOString(), offset.weekStart.toISOString());
});

test("calendar months stay first-to-next-first in the device zone across DST", () => {
  const zone = "America/Chicago";
  const march = monthBounds(new Date("2026-03-10T18:00:00.000Z"), zone);
  assert.equal(zonedParts(march.monthStart, zone).day, 1);
  assert.equal(zonedParts(march.monthStart, zone).hour, 0);
  assert.equal(zonedParts(march.monthEnd, zone).month, 4);
  assert.equal(zonedParts(march.monthEnd, zone).day, 1);
  assert.notEqual(march.monthEnd.getTime() - march.monthStart.getTime(), 31 * 24 * 60 * 60 * 1_000);

  const november = monthBounds(new Date("2026-11-11T18:00:00.000Z"), zone);
  assert.equal(formatMonthRangeLabel(november.monthStart, november.monthEnd, zone), "Nov 1 – 30");
});

test("Home query prefers IANA timeZone over offset arithmetic", () => {
  const parsed = homeQuerySchema.safeParse({
    timeZone: "America/Chicago",
    timezoneOffsetMinutes: "300",
    view: "home",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const now = new Date("2026-03-10T18:00:00.000Z");
  const bounds = homeLocalBounds(now, parsed.data);
  assert.equal(bounds.weekStart.toISOString(), sundayWeekBounds(now, "America/Chicago").weekStart.toISOString());
});

test("week and month range labels use the device zone", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-11-11T18:00:00.000Z");
  const week = sundayWeekBounds(now, zone);
  assert.equal(formatWeekRangeLabel(week.weekStart, week.weekEnd, zone), "Sun Nov 8 – Sat Nov 14");
  const monthStart = zonedLocalToUtc(2026, 11, 1, 0, 0, 0, zone);
  const monthEnd = zonedLocalToUtc(2026, 12, 1, 0, 0, 0, zone);
  assert.equal(formatMonthRangeLabel(monthStart, monthEnd, zone), "Nov 1 – 30");
});

test("Tokyo Saturday night stays in the current Sunday week", () => {
  const tokyo = "Asia/Tokyo";
  const saturdayNight = new Date("2026-11-14T14:59:59.000Z");
  const { weekStart, weekEnd } = sundayWeekBounds(saturdayNight, tokyo);
  assert.equal(saturdayNight >= weekStart && saturdayNight < weekEnd, true);
  const sundayMorning = new Date("2026-11-14T15:00:00.000Z");
  assert.equal(sundayMorning >= weekEnd, true);
});

test("inclusive date filters are half-open in the requested zone", () => {
  const zone = "America/Chicago";
  const range = inclusiveDateRangeBounds("2026-11-01", "2026-11-08", zone);
  assert.ok(range);
  assert.equal(zonedParts(range.start, zone).day, 1);
  assert.equal(zonedParts(range.end, zone).day, 9);
  assert.equal(range.end.getTime() > range.start.getTime(), true);
});

test("workout cursors round-trip precise timestamps and reject junk", () => {
  const cursor = encodeWorkoutCursor("2026-11-10T12:00:00.123456Z", "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(decodeWorkoutCursor(cursor), {
    occurredAtPrecise: "2026-11-10T12:00:00.123456Z",
    id: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(decodeWorkoutCursor("not-a-cursor"), null);
  assert.equal(decodeWorkoutCursor(encodeWorkoutCursor("nope", "11111111-1111-4111-8111-111111111111")), null);
});

test("distance totals sum meters then display one labeled unit", () => {
  assert.equal(formatDashboardDistance(5_000, "mi"), "3.1 mi");
  assert.equal(formatDashboardDistance(5_000, "km"), "5 km");
  assert.equal(formatRecordedDuration(3 * 3600 + 12 * 60), "3h 12m");
});

test("missing duration and distance stay unknown instead of measured zeros", () => {
  const empty: TotalsCoverageInput = {
    workoutCount: 0,
    recordedSeconds: null,
    recordedMeters: null,
    missingDurationCount: 0,
    loggedDistanceUnits: [],
    distanceUnit: "mi",
  };
  assert.equal(totalsEmptyLabel(empty), true);
  assert.equal(formatTotalsTime(empty), null);
  assert.equal(formatTotalsDistance(empty), null);
  assert.equal(totalsCoverageLine(empty), profileDashboardCopy.totalsEmpty);
  assert.equal(identityThisWeekLabel(0), "This week · 0 workouts");

  const partial: TotalsCoverageInput = {
    workoutCount: 4,
    recordedSeconds: 3 * 3600 + 12 * 60,
    recordedMeters: 1609.344 * 8,
    missingDurationCount: 2,
    loggedDistanceUnits: ["mi", "km"],
    distanceUnit: "mi",
  };
  assert.equal(formatTotalsTime(partial), "3h 12m");
  assert.match(totalsCoverageLine(partial), /2 workouts have no duration/);
  assert.match(totalsCoverageLine(partial), /shown in miles/);
  assert.match(totalsCoverageLine(partial), /logged in km/);
});

test("what's included copy names the current zone and coverage", () => {
  const paragraphs = totalsHelpParagraphs({
    timeZoneLabel: "Central Time",
    week: {
      workoutCount: 4,
      recordedSeconds: 3 * 3600 + 12 * 60,
      recordedMeters: 1000,
      missingDurationCount: 2,
      loggedDistanceUnits: ["mi"],
      distanceUnit: "mi",
    },
    weekTimeLabel: "3h 12m",
  });
  assert.match(paragraphs[0] ?? "", /Central Time/);
  assert.match(paragraphs[2] ?? "", /3h 12m/);
  assert.equal(timeZoneDisplayName("America/Chicago").includes("Central"), true);
});

function addLast(weekEnd: Date) {
  return new Date(weekEnd.getTime() - 1_000);
}
