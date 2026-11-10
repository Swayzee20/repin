import {
  distancePrLanes,
  durationMinutesError,
  goalKinds,
  goalMetrics,
  goalSchedules,
  workoutTypes,
  type GoalKind,
  type GoalMetric,
  type GoalSchedule,
  type WorkoutType,
} from "@repin/types";
import { z } from "zod";

const ianaTimeZoneSchema = z.string().trim().min(1).max(64).superRefine((value, context) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    context.addIssue({
      code: "custom",
      message: "Choose a valid time zone",
    });
  }
});

const distanceUnitSchema = z.enum(["mi", "km", "m"]);
const volumeMetrics = ["distance", "workout_count", "minutes"] as const;
const timeSports = ["run", "walk", "cycling"] as const;
const distanceSports = ["run", "walk", "cycling"] as const;

export const optionalDurationMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(1_440)
  .nullable();

export function parseOptionalDurationMinutes(raw: string): {
  value: number | null;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { error: null, value: null };
  if (!/^\d+$/.test(trimmed)) return { error: durationMinutesError, value: null };
  const value = Number(trimmed);
  if (value < 1 || value > 1_440) return { error: durationMinutesError, value: null };
  return { error: null, value };
}

export const createGoalSchema = z
  .object({
    kind: z.enum(goalKinds),
    metric: z.enum(goalMetrics).optional(),
    sportFilter: z.enum(workoutTypes).nullable().optional(),
    target: z.number().positive(),
    targetMinutes: z.number().int().min(0).max(600).optional(),
    targetSeconds: z.number().int().min(0).max(59).optional(),
    displayUnit: z.string().trim().min(1).max(16).nullable().optional(),
    schedule: z.enum(goalSchedules).optional(),
    deadlineAt: z.iso.datetime().nullable().optional(),
    timeZone: ianaTimeZoneSchema,
    movementId: z.uuid().nullable().optional(),
    movementName: z.string().trim().min(1).max(80).nullable().optional(),
    lane: z.enum(distancePrLanes).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "volume") {
      const metric = value.metric;
      if (!metric || !volumeMetrics.includes(metric as (typeof volumeMetrics)[number])) {
        context.addIssue({
          code: "custom",
          message: "Choose distance, workouts, or minutes",
          path: ["metric"],
        });
        return;
      }
      const schedule = value.schedule ?? "weekly";
      if (schedule === "one_time" && !value.deadlineAt) {
        context.addIssue({
          code: "custom",
          message: "One-time volume goals need an end date",
          path: ["deadlineAt"],
        });
      }
      if (schedule !== "one_time" && schedule !== "weekly" && schedule !== "monthly") {
        context.addIssue({
          code: "custom",
          message: "Volume goals repeat weekly, monthly, or once",
          path: ["schedule"],
        });
      }
      if (metric === "distance") {
        if (value.sportFilter && !distanceSports.includes(value.sportFilter as (typeof distanceSports)[number])) {
          context.addIssue({
            code: "custom",
            message: "Distance goals use run, walk, cycling, or all sports",
            path: ["sportFilter"],
          });
        }
        const parsedUnit = distanceUnitSchema.safeParse(value.displayUnit ?? "mi");
        if (!parsedUnit.success) {
          context.addIssue({
            code: "custom",
            message: "Choose miles, kilometers, or meters",
            path: ["displayUnit"],
          });
        }
      } else if (value.sportFilter && !workoutTypes.includes(value.sportFilter)) {
        context.addIssue({
          code: "custom",
          message: "Choose a sport, or all sports",
          path: ["sportFilter"],
        });
      }
    }
    if (value.kind === "time") {
      if (!value.sportFilter || !timeSports.includes(value.sportFilter as (typeof timeSports)[number])) {
        context.addIssue({
          code: "custom",
          message: "Choose run, walk, or ride",
          path: ["sportFilter"],
        });
      }
      if (!value.lane) {
        context.addIssue({
          code: "custom",
          message: "Choose a distance",
          path: ["lane"],
        });
      }
      const minutes = value.targetMinutes ?? Math.floor(value.target);
      const seconds = value.targetSeconds ?? 0;
      if (minutes * 60 + seconds <= 0) {
        context.addIssue({
          code: "custom",
          message: "Target time must be faster than zero",
          path: ["target"],
        });
      }
    }
    if (value.kind === "lift") {
      if (!value.movementId && !value.movementName) {
        context.addIssue({
          code: "custom",
          message: "Choose a movement",
          path: ["movementName"],
        });
      }
      const unit = value.displayUnit ?? "lb";
      if (unit !== "lb" && unit !== "kg") {
        context.addIssue({
          code: "custom",
          message: "Choose lb or kg",
          path: ["displayUnit"],
        });
      }
    }
  });

export const updateGoalSchema = createGoalSchema;

export const shareSessionGoalsSchema = z
  .object({
    periodIds: z.array(z.uuid()).max(5).optional(),
  })
  .strict();

export const restoreGoalBadgesSchema = z
  .object({
    periodIds: z.array(z.uuid()).min(1).max(5),
  })
  .strict();

export const goalIdSchema = z.uuid();

export function resolvedTimeTargetSeconds(input: {
  target: number;
  targetMinutes?: number;
  targetSeconds?: number;
}) {
  if (input.targetMinutes != null || input.targetSeconds != null) {
    return (input.targetMinutes ?? 0) * 60 + (input.targetSeconds ?? 0);
  }
  return input.target;
}

export function resolvedVolumeMetric(kind: GoalKind, metric: GoalMetric | undefined): GoalMetric {
  if (kind === "time") return "time";
  if (kind === "lift") return "load";
  return metric ?? "distance";
}

export function resolvedSchedule(kind: GoalKind, schedule: GoalSchedule | undefined): GoalSchedule {
  if (kind !== "volume") return "one_time";
  return schedule ?? "weekly";
}

export const goalCopy = {
  emptyTitle: "No goals yet",
  emptyBody:
    "Set a private goal to track distance, workouts, minutes, or a time or lift target.",
  emptyAction: "Set a goal",
  cap: "You have 5 active goals. Archive one, or wait for a one-time goal to finish, before adding another.",
  errorTitle: "Couldn't load goals",
  errorBody: "Check your connection and try again.",
  errorAction: "Try again",
  weeklyHelper: "Sun–Sat. Only workouts you log after you save this count.",
  timeRule: (sport: string, time: string) =>
    `Reached when a qualifying ${sport} is strictly faster than ${time}.`,
  liftRule: (target: string) => `Reached on any 1-rep set at or above ${target}.`,
  handMarkHelper: "Optional. Marking it done by hand stays private, with no badge.",
  celebration: "Goal reached",
  combined: "and a new PR",
  shareTitle: (crew: string) => `Share with ${crew}?`,
  shareBody:
    "Adds a Goal badge to the post you just logged. Same post, no extra notification.",
  sharePrimary: "Share",
  shareSecondary: "Not now",
  noPost:
    "Saved privately. This workout isn't on a crew feed, so there's nothing to share yet.",
  noPostPrimary: "Done",
  shareError: "Couldn't share. Check your connection and try again.",
  durationHelper: "Optional. Leave blank if you do not want to track time.",
  durationError: durationMinutesError,
  toast: "Goal badge removed",
  toastUndo: "Undo",
  unshare: "Remove Goal badge",
  archiveTitle: "Archive this goal?",
  archiveBody:
    "It leaves your active list and frees a slot. Shared Goal badges on posts stay put. You can still find it in History.",
  deleteTitle: "Delete this goal?",
  deleteBody:
    "This removes the goal, its history, and any Goal badges on posts. Your workouts and posts stay. This cannot be undone.",
  reopenTitle: "Reopen this goal?",
  reopenBody:
    "This starts a fresh run from today. Past workouts will not count again, and it uses one of your 5 active slots.",
  reopenAtCap:
    "You already have 5 active goals. Archive one first, then you can reopen this.",
  markDoneTitle: "Mark this done?",
  markDoneBody: "This stays private, with no Goal badge.",
  timezoneMissing: "Choose a valid time zone",
  addGoal: "Add a goal",
  history: "History",
  loggedAfterHelper: "Only workouts logged after you created this goal count.",
} as const;

export const goalChipAccessibility = {
  goal: (count: number) => (count === 1 ? "Goal reached" : `${count} goals reached`),
  mixed: (goals: number, prs: number) => {
    const goalPart = goals === 1 ? "Goal reached" : `${goals} goals reached`;
    if (prs <= 0) return goalPart;
    const prPart = prs === 1 ? "personal record" : `${prs} personal records`;
    return `${goalPart} and ${prPart}`;
  },
};

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type VolumeMetric = (typeof volumeMetrics)[number];
export type TimeSport = (typeof timeSports)[number];
export type DistanceSport = (typeof distanceSports)[number] | WorkoutType;
