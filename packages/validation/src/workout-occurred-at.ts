import { exclusiveDeadlineAtEndOfLocalDay } from "./calendar";

/** Matches typical phone clock drift and minute-rounded datetime pickers. */
export const WORKOUT_OCCURRED_AT_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/**
 * Easternmost civil timezone (UTC+14, no DST). Used when the client sends a
 * `Z` timestamp, which the app always does via `Date.toISOString()`.
 */
export const WORKOUT_OCCURRED_AT_LATEST_ZONE = "Pacific/Kiritimati";

export const WORKOUT_OCCURRED_AT_FUTURE_MESSAGE = "Workout date cannot be in the future";

const ISO_OFFSET_PATTERN = /([+-])(\d{2}):(\d{2})$/;
const MAX_OFFSET_MINUTES = 14 * 60;

/**
 * Numeric offset minutes east of UTC, or `null` when the string is `Z` /
 * offset-less. `Z` is treated as unknown because the mobile client always
 * serializes with `toISOString()`, regardless of the user's local day.
 */
export function isoDatetimeOffsetMinutesEastOfUtc(iso: string): number | null {
  const trimmed = iso.trim();
  if (/z$/i.test(trimmed)) return null;
  const match = ISO_OFFSET_PATTERN.exec(trimmed);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (minutes > MAX_OFFSET_MINUTES) return null;
  return (match[1] === "-" ? -1 : 1) * minutes;
}

function exclusiveEndOfFixedOffsetDay(now: Date, offsetMinutesEastOfUtc: number) {
  const localMs = now.getTime() + offsetMinutesEastOfUtc * 60_000;
  const local = new Date(localMs);
  const nextMidnightUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
  );
  return new Date(nextMidnightUtcMs - offsetMinutesEastOfUtc * 60_000);
}

export function workoutOccurredAtFutureIssue() {
  return {
    code: "custom" as const,
    message: WORKOUT_OCCURRED_AT_FUTURE_MESSAGE,
    path: ["occurredAt"] as PropertyKey[],
  };
}

/**
 * Quick log and detailed workout default to `new Date()` and keep a chosen
 * time when the user picks today, including later today. Without a numeric
 * offset, allow up to the end of the current local day in UTC+14 so that
 * "today at 11:59 PM" from any timezone is accepted, plus a few minutes of
 * clock skew for `now` near that boundary.
 */
export function isWorkoutOccurredAtAllowed(occurredAt: string, now = new Date()) {
  const instant = Date.parse(occurredAt);
  if (Number.isNaN(instant)) return false;
  if (instant <= now.getTime() + WORKOUT_OCCURRED_AT_CLOCK_SKEW_MS) return true;
  const offset = isoDatetimeOffsetMinutesEastOfUtc(occurredAt);
  const localEnd = offset == null
    ? exclusiveDeadlineAtEndOfLocalDay(now, WORKOUT_OCCURRED_AT_LATEST_ZONE)
    : exclusiveEndOfFixedOffsetDay(now, offset);
  return instant < localEnd.getTime();
}
