import { workoutTypes, type WorkoutType } from "@repin/types";
import { z } from "zod";

import {
  addZonedDays,
  isValidTimeZone,
  monthBounds,
  startOfZonedDay,
  sundayWeekBounds,
  sundayWeekBoundsFromOffset,
  zonedLocalToUtc,
  zonedParts,
} from "./calendar";

export const dashboardDistanceSports = ["run", "walk", "cycling"] as const;
export type DashboardDistanceSport = (typeof dashboardDistanceSports)[number];

export const dashboardDistanceUnits = ["mi", "km"] as const;
export type DashboardDistanceUnit = (typeof dashboardDistanceUnits)[number];

export const dashboardPreviewLimit = 3;
export const dashboardHistoryDefaultLimit = 25;
export const dashboardHistoryMaxLimit = 50;

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const monthShort = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const cursorTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ianaTimeZoneQuerySchema = z.string().trim().min(1).max(64).superRefine((value, context) => {
  if (!isValidTimeZone(value)) {
    context.addIssue({
      code: "custom",
      message: "Choose a valid time zone",
    });
  }
});

export const dashboardSportSchema = z.enum(workoutTypes);

export const personalWorkoutListQuerySchema = z.object({
  timeZone: ianaTimeZoneQuerySchema,
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(dashboardHistoryMaxLimit).optional(),
  sport: dashboardSportSchema.optional(),
  from: z.string().regex(dateOnlyPattern).optional(),
  to: z.string().regex(dateOnlyPattern).optional(),
}).superRefine((query, context) => {
  if (Boolean(query.from) !== Boolean(query.to)) {
    context.addIssue({
      code: "custom",
      message: "Start and end dates must be supplied together",
      path: [query.from ? "to" : "from"],
    });
  }
});

export const workoutStatsQuerySchema = z.object({
  timeZone: ianaTimeZoneQuerySchema,
  distanceUnit: z.enum(dashboardDistanceUnits).optional(),
});

export const personalRecordsQuerySchema = z.object({
  kind: z.enum(["heaviest_single", "distance_time", "amrap", "for_time"]).optional(),
});

export const deviceTimeQuerySchema = z.object({
  timeZone: ianaTimeZoneQuerySchema.optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
}).superRefine((value, context) => {
  if (!value.timeZone && value.timezoneOffsetMinutes == null) {
    context.addIssue({
      code: "custom",
      message: "Choose a valid time zone",
      path: ["timeZone"],
    });
  }
});

export type WorkoutListCursor = {
  occurredAtPrecise: string;
  id: string;
};

export function encodeWorkoutCursor(occurredAtPrecise: string, id: string) {
  return Buffer.from(
    JSON.stringify({ v: "v1", t: occurredAtPrecise, id }),
    "utf8",
  ).toString("base64url");
}

export function decodeWorkoutCursor(cursor: string): WorkoutListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      v?: unknown;
      t?: unknown;
      id?: unknown;
    };
    if (parsed.v !== "v1" || typeof parsed.t !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (!cursorTimePattern.test(parsed.t) || !uuidPattern.test(parsed.id)) return null;
    return { occurredAtPrecise: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export function homeLocalBounds(
  now: Date,
  query: { timeZone?: string; timezoneOffsetMinutes?: number },
) {
  if (query.timeZone) {
    const todayStart = startOfZonedDay(now, query.timeZone);
    const week = sundayWeekBounds(now, query.timeZone);
    return { todayStart, weekStart: week.weekStart, weekEnd: week.weekEnd };
  }
  const offset = query.timezoneOffsetMinutes ?? 0;
  const week = sundayWeekBoundsFromOffset(now, offset);
  const local = new Date(now.getTime() - offset * 60_000);
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const todayStart = new Date(localMidnightUtc + offset * 60_000);
  return { todayStart, weekStart: week.weekStart, weekEnd: week.weekEnd };
}

export function dashboardPeriodBounds(now: Date, timeZone: string) {
  const week = sundayWeekBounds(now, timeZone);
  const month = monthBounds(now, timeZone);
  return {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    monthStart: month.monthStart,
    monthEnd: month.monthEnd,
  };
}

export function inclusiveDateRangeBounds(
  from: string,
  to: string,
  timeZone: string,
) {
  const startParts = dateOnlyPattern.exec(from);
  const endParts = dateOnlyPattern.exec(to);
  if (!startParts || !endParts) return null;
  const start = zonedLocalToUtc(
    Number(startParts[1]),
    Number(startParts[2]),
    Number(startParts[3]),
    0,
    0,
    0,
    timeZone,
  );
  const endDay = zonedLocalToUtc(
    Number(endParts[1]),
    Number(endParts[2]),
    Number(endParts[3]),
    0,
    0,
    0,
    timeZone,
  );
  const end = addZonedDays(endDay, 1, timeZone);
  if (!(start < end)) return null;
  return { start, end };
}

export function formatWeekRangeLabel(weekStart: Date, weekEnd: Date, timeZone: string) {
  const start = zonedParts(weekStart, timeZone);
  const last = zonedParts(addZonedDays(weekEnd, -1, timeZone), timeZone);
  return `${weekdayShort[start.weekday]} ${monthShort[start.month]} ${start.day} – ${weekdayShort[last.weekday]} ${monthShort[last.month]} ${last.day}`;
}

export function formatMonthRangeLabel(monthStart: Date, monthEnd: Date, timeZone: string) {
  const start = zonedParts(monthStart, timeZone);
  const last = zonedParts(addZonedDays(monthEnd, -1, timeZone), timeZone);
  return `${monthShort[start.month]} ${start.day} – ${last.day}`;
}

export function formatPerformedDateGroup(occurredAt: Date, timeZone: string) {
  const parts = zonedParts(occurredAt, timeZone);
  return `${weekdayShort[parts.weekday]} ${monthShort[parts.month]} ${parts.day}`;
}

export function formatPerformedDateTime(occurredAt: Date, timeZone: string) {
  const parts = zonedParts(occurredAt, timeZone);
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const minute = String(parts.minute).padStart(2, "0");
  const suffix = parts.hour < 12 ? "AM" : "PM";
  return `${weekdayShort[parts.weekday]}, ${monthShort[parts.month]} ${parts.day} · ${hour12}:${minute} ${suffix}`;
}

export function timeZoneDisplayName(timeZone: string, at = new Date()) {
  try {
    const generic = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value;
    if (generic) return generic;
    const long = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "long",
    }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value;
    return long?.replace(/\s(Standard|Daylight|Summer)\sTime/, " Time") ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function metersFromLoggedDistance(value: number, unit: string | null | undefined) {
  if (!(value > 0)) return null;
  if (unit === "km") return value * 1_000;
  if (unit === "mi") return value * 1_609.344;
  if (unit === "m") return value;
  return null;
}

export function metersToDashboardUnit(meters: number, unit: DashboardDistanceUnit) {
  if (unit === "km") return meters / 1_000;
  return meters / 1_609.344;
}

export function formatDashboardDistance(meters: number, unit: DashboardDistanceUnit) {
  const value = metersToDashboardUnit(meters, unit);
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${unit}`;
}

/** Sum seconds first, then round minutes for display. */
export function formatRecordedDuration(seconds: number) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function isDashboardDistanceSport(workoutType: string): workoutType is DashboardDistanceSport {
  return dashboardDistanceSports.some((sport) => sport === workoutType);
}

export function dashboardSportLabel(workoutType: string) {
  if (workoutType === "cycling") return "Ride";
  if (workoutType === "run") return "Run";
  if (workoutType === "walk") return "Walk";
  if (workoutType === "strength_training") return "Strength Training";
  if (workoutType === "powerlifting") return "Powerlifting";
  if (workoutType === "hiit") return "HIIT";
  if (workoutType === "functional_fitness") return "Functional Fitness";
  if (workoutType === "other") return "Other";
  return workoutType;
}

export function identityThisWeekLabel(count: number) {
  return `This week · ${count} ${count === 1 ? "workout" : "workouts"}`;
}

export type TotalsCoverageInput = {
  workoutCount: number;
  recordedSeconds: number | null;
  recordedMeters: number | null;
  missingDurationCount: number;
  loggedDistanceUnits: string[];
  distanceUnit: DashboardDistanceUnit;
};

export function totalsEmptyLabel(stats: Pick<TotalsCoverageInput, "workoutCount">) {
  return stats.workoutCount === 0;
}

export function formatTotalsTime(stats: TotalsCoverageInput) {
  if (stats.workoutCount === 0 || stats.recordedSeconds == null) return null;
  return formatRecordedDuration(stats.recordedSeconds);
}

export function formatTotalsDistance(stats: TotalsCoverageInput) {
  if (stats.workoutCount === 0 || stats.recordedMeters == null) return null;
  return formatDashboardDistance(stats.recordedMeters, stats.distanceUnit);
}

export function totalsCoverageLine(stats: TotalsCoverageInput) {
  if (stats.workoutCount === 0) return profileDashboardCopy.totalsEmpty;
  const unitWord = stats.distanceUnit === "km" ? "kilometers" : "miles";
  const parts: string[] = [];
  if (stats.missingDurationCount > 0) {
    parts.push(
      `${stats.missingDurationCount} workout${stats.missingDurationCount === 1 ? "" : "s"} have no duration.`,
    );
  }
  parts.push(`Distance from Run, Walk, and Ride, shown in ${unitWord}.`);
  const mixedKm = stats.distanceUnit === "mi" && stats.loggedDistanceUnits.includes("km");
  if (mixedKm) {
    parts.push("Some distance was logged in km and converted.");
  }
  return parts.join(" ");
}

export function totalsHelpParagraphs(input: {
  timeZoneLabel: string;
  week: TotalsCoverageInput;
  weekTimeLabel: string | null;
}) {
  const missing = input.week.missingDurationCount;
  const timeNote = missing > 0 && input.weekTimeLabel
    ? ` ${missing} workout${missing === 1 ? "" : "s"} this week have no duration, so they are not in the ${input.weekTimeLabel}.`
    : missing > 0
      ? ` ${missing} workout${missing === 1 ? "" : "s"} this week have no duration, so they are not in the time total.`
      : "";
  const unitWord = input.week.distanceUnit === "km" ? "kilometers" : "miles";
  const meterWord = input.week.distanceUnit === "km" ? "kilometers" : "meters";
  return [
    `This week is Sun–Sat in your current time zone, ${input.timeZoneLabel}. This month is the calendar month.`,
    "Workout count includes every workout you logged, even without time or distance.",
    `Time totals use minutes you recorded.${timeNote}`,
    `Distance is from Run, Walk, and Ride only, added up in ${meterWord}, shown in ${unitWord}. A workout with no distance is left out of that total.`,
    "Goals use their own saved time zone and only count workouts logged after you created each goal.",
  ];
}

export const profileDashboardCopy = {
  totalsEmpty: "No workouts yet, so there is no time or distance to show. Totals only use minutes and distance you record.",
  noWorkoutsValue: "No workouts",
  whatsIncluded: "What's included",
  recentEmptyTitle: "No workouts yet",
  recentEmptyBody: "Log a workout from a crew to see it here. Every workout you log shows up, whether you share it or not.",
  viewAllWorkouts: "View all workouts",
  currentBestsHelper: "Your current best in each lift or time. A new best replaces the last one.",
  bestsEmptyTitle: "No current bests yet",
  bestsEmptyBody: "Your best lifts and times will show up here when you log a qualifying workout.",
  viewAllBests: "View all current bests",
  startingBest: "Starting best",
  startingBestA11y: "Starting best",
  missingSource: "Source workout no longer available",
  quickLogTitle: "No detailed results recorded",
  quickLogBody: "This workout still counts. Duration and sets were not logged.",
  quickLogBodyWithMinutes: "This workout still counts.",
  intervalRecovery: "Recovery is shown, not added to the work total.",
  noOverallTime: "No overall time was recorded.",
  runHelper: "Distance and time as logged. Pace is from this workout only.",
  filterEmptyTitle: "No matching workouts",
  filterEmptyBody: "Nothing in this sport or date range. Try All sports, or pick a different range.",
  filterTitle: "Filter workouts",
  filterDates: "Dates",
  anyDates: "Any dates",
  showWorkouts: "Show workouts",
  allSports: "All sports",
  endOfHistory: "That's all of your workouts.",
  workoutsErrorTitle: "Couldn't load workouts",
  bestsErrorTitle: "Couldn't load current bests",
  statsErrorTitle: "Couldn't load totals",
  errorBody: "Check your connection and try again.",
  tryAgain: "Try again",
  stale: (time: string) => `Couldn't refresh. Last updated ${time}.`,
  noCrewsTitle: "No crews yet",
  noCrewsBody: "Join a crew to start logging.",
  joinCrew: "Join a crew",
  crewsTitle: "Crews",
  recentTitle: "Recent workouts",
  bestsTitle: "Current bests",
  workoutsTitle: "Workouts",
  workoutTitle: "Workout",
  thisWeek: "This week",
  thisMonth: "This month",
  filter: "Filter",
  noDuration: "No overall time was recorded.",
} as const;

export const dashboardSportFilterOptions: { label: string; value: WorkoutType | null }[] = [
  { label: profileDashboardCopy.allSports, value: null },
  ...workoutTypes.map((value) => ({ label: dashboardSportLabel(value), value })),
];
