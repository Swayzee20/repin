import { z } from "zod";

import {
  communityReactionTypes,
  contentReportReasons,
  contentReportTargetTypes,
  runWorkoutSubtypes,
  workoutDistanceUnits,
  workoutMetricTypes,
  workoutSessionSegmentTypes,
  workoutTypes,
} from "@repin/types";

import {
  canonicalWorkoutFormatSchema,
  durationMinutesFromFormat,
  formatToColumns,
  normalizeFormat,
  workoutFormatSchema,
} from "./workout-format";

export {
  amrapFormatSchema,
  columnsToFormat,
  durationMinutesFromFormat,
  emomFormatSchema,
  emptyFormatColumns,
  formatToColumns,
  forTimeFormatSchema,
  requiresUpdatedClient,
  roundsFormatSchema,
  workoutFormatSchema,
} from "./workout-format";

export {
  crewAlertAllowed,
  crewAlertTypes,
  crewCopy,
  crewMarkLetters,
  crewMarkTiles,
  crewNotificationPrefsSchema,
  crewPagePermissions,
  crewPageQuerySchema,
  crewPhotoPathPattern,
  defaultCrewNotificationPrefs,
  firstNameForToast,
  formatCreatedLabel,
  formatMemberCount,
  formatWorkoutsThisWeek,
  isCrewPhotoPathForGroup,
  isInMondayWeek,
  mondayWeekBounds,
  notificationSummary,
  resolveCrewNotificationPrefs,
  transferCrewSchema,
  updateCrewSchema,
  type CrewAlertType,
  type CrewNotificationPrefs,
} from "./crew";

export {
  commentPushBody,
  crewPushAlertTypes,
  crewPushBody,
  crewPushHref,
  expoPushTokenPattern,
  isPushRecipientEligible,
  newWorkoutPushBody,
  parseCrewPushPayload,
  pushCopy,
  pushPlatforms,
  reactionPushBody,
  REACTION_PUSH_WINDOW_MS,
  registerPushTokenSchema,
  shouldSendReactionPush,
  unregisterPushTokenSchema,
  type CrewPushAlertType,
  type CrewPushPayload,
  type PushPlatform,
} from "./push";

function isWorkoutDistanceUnit(unit: string | null | undefined): unit is (typeof workoutDistanceUnits)[number] {
  return unit != null && (workoutDistanceUnits as readonly string[]).includes(unit);
}

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const groupIdSchema = z.uuid();
export const uuidSchema = z.uuid();
export const workoutSessionIdSchema = z.uuid();

export const setCommunityReactionSchema = z.object({
  reactionType: z.enum(communityReactionTypes),
}).strict();

export const createCommunityCommentSchema = z.object({
  text: z.string().trim().min(1, "Enter a comment").max(2_000, "Comment is too long"),
}).strict();

export const createContentReportSchema = z.object({
  targetType: z.enum(contentReportTargetTypes),
  targetId: z.uuid(),
  reason: z.enum(contentReportReasons),
  details: z.string().trim().max(500, "Details are too long").optional(),
  alsoBlock: z.boolean().optional(),
}).strict();

export const reviewContentReportSchema = z.object({
  action: z.enum(["remove", "keep", "restore"]),
}).strict();

export const adminSignInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
}).strict();

export const groupSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const inviteCodeSchema = z
  .string()
  .trim()
  .transform((code) => code.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,
        "Invite code must be 8 letters or numbers",
      ),
  );

export const joinGroupByInviteCodeSchema = z.object({
  inviteCode: inviteCodeSchema,
});

const canonicalWorkoutTypeSchema = z.string().trim().transform((value, context) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, (typeof workoutTypes)[number]> = {
    functional_fitness: "functional_fitness",
    crossfit: "functional_fitness",
    cycling: "cycling",
    strength: "strength_training",
    strength_training: "strength_training",
    yoga: "other",
  };
  const workoutType = aliases[normalized] ?? workoutTypes.find((type) => type === normalized);
  if (!workoutType) {
    context.addIssue({ code: "custom", message: "Choose a valid workout type" });
    return z.NEVER;
  }
  return workoutType;
});

const workoutMetricSchema = z
  .object({
    metricType: z.enum(workoutMetricTypes),
    label: z.string().trim().max(80).nullable().optional(),
    numericValue: z.number().finite().nullable().optional(),
    textValue: z.string().trim().max(500).nullable().optional(),
    unit: z.string().trim().max(24).nullable().optional(),
  })
  .strict()
  .superRefine((metric, context) => {
    const hasNumeric = metric.numericValue != null;
    const hasText = Boolean(metric.textValue);
    if (!hasNumeric && !hasText) {
      context.addIssue({ code: "custom", message: "Add a value for this metric" });
    }
    if (metric.metricType === "duration") {
      if (!hasNumeric || (metric.numericValue ?? 0) <= 0) {
        context.addIssue({ code: "custom", message: "Duration must be greater than zero", path: ["numericValue"] });
      }
      if (metric.unit !== "seconds") {
        context.addIssue({ code: "custom", message: "Duration must use seconds", path: ["unit"] });
      }
    }
    if (metric.metricType === "distance") {
      if (!hasNumeric || (metric.numericValue ?? 0) <= 0) {
        context.addIssue({ code: "custom", message: "Distance must be greater than zero", path: ["numericValue"] });
      }
      if (!isWorkoutDistanceUnit(metric.unit)) {
        context.addIssue({ code: "custom", message: "Distance must use m, km, or mi", path: ["unit"] });
      }
    }
    if (metric.metricType === "rounds" && (!hasNumeric || !Number.isInteger(metric.numericValue) || (metric.numericValue ?? 0) <= 0)) {
      context.addIssue({ code: "custom", message: "Rounds must be a positive whole number", path: ["numericValue"] });
    }
    if (metric.metricType === "score" && !hasText) {
      context.addIssue({ code: "custom", message: "Enter a score", path: ["textValue"] });
    }
  });

const movementNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Exercise name is required").max(160));

const workoutSetSchema = z
  .object({
    reps: z.number().int().positive().nullable().optional(),
    load: z.number().finite().min(0).nullable().optional(),
    loadUnit: z.enum(["lb", "kg"]).nullable().optional(),
    distance: z.number().finite().positive().nullable().optional(),
    distanceUnit: z.enum(workoutDistanceUnits).nullable().optional(),
    calories: z.number().int().nonnegative().nullable().optional(),
    durationSeconds: z.number().int().positive().nullable().optional(),
    count: z.number().int().min(1).max(20).optional(),
  })
  .strict()
  .superRefine((set, context) => {
    if (
      set.reps == null
      && set.load == null
      && set.distance == null
      && set.calories == null
      && set.durationSeconds == null
    ) {
      context.addIssue({ code: "custom", message: "Add at least one result to this set" });
    }
    if (set.load != null && !set.loadUnit) {
      context.addIssue({ code: "custom", message: "Choose lb or kg", path: ["loadUnit"] });
    }
    if ((set.distance == null) !== (set.distanceUnit == null)) {
      context.addIssue({
        code: "custom",
        message: "Set distance and unit must be provided together",
        path: ["distance"],
      });
    }
  });

const workoutMovementSchema = z
  .object({
    movementId: z.uuid().nullable().optional(),
    movementName: movementNameSchema,
    sets: z.array(workoutSetSchema).max(100),
  })
  .strict();

const workoutMovementInputSchema = workoutMovementSchema
  .superRefine((movement, context) => {
    const expandedCount = movement.sets.reduce((total, set) => total + (set.count ?? 1), 0);
    if (expandedCount > 100) {
      context.addIssue({ code: "custom", message: "A movement can have at most 100 sets", path: ["sets"] });
    }
  })
  .transform((movement) => ({
    ...movement,
    sets: movement.sets.flatMap(({ count, ...set }) =>
      Array.from({ length: count ?? 1 }, () => set),
    ),
  }));

const workoutSessionSegmentSchema = z
  .object({
    position: z.number().int().nonnegative(),
    segmentType: z.enum(workoutSessionSegmentTypes),
    distance: z.number().finite().positive().nullable().optional(),
    distanceUnit: z.enum(workoutDistanceUnits).nullable().optional(),
    durationSeconds: z.number().int().positive().nullable().optional(),
    recoverySeconds: z.number().int().positive().nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
    configuration: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict()
  .superRefine((segment, context) => {
    if ((segment.distance == null) !== (segment.distanceUnit == null)) {
      context.addIssue({ code: "custom", message: "Segment distance and unit must be provided together", path: ["distance"] });
    }
    if (segment.distance == null && segment.durationSeconds == null && segment.recoverySeconds == null) {
      context.addIssue({ code: "custom", message: "Add at least one result to this segment" });
    }
  });

const canonicalWorkoutSchema = z.object({
  workoutType: z.enum(workoutTypes),
  workoutSubtype: z.enum(runWorkoutSubtypes).nullable(),
  name: z.string().nullable(),
  durationMinutes: z.number().int().min(1).max(1_440).nullable(),
  effort: z.number().int().min(1).max(5).nullable(),
  caption: z.string().max(2_000).nullable(),
  photoPath: z.string().max(500).nullable(),
  occurredAt: z.iso.datetime(),
  logVersion: z.number().int().positive().nullable(),
  format: canonicalWorkoutFormatSchema.nullable(),
  metrics: z.array(workoutMetricSchema).max(20),
  movements: z.array(workoutMovementSchema).max(50),
  segments: z.array(workoutSessionSegmentSchema).max(500),
}).superRefine((workout, context) => {
  const seen = new Set<string>();
  const allowedMetricTypes: Record<(typeof workoutTypes)[number], Set<string>> = {
    run: new Set(["distance", "duration"]),
    walk: new Set(["distance", "duration"]),
    cycling: new Set(["distance", "duration"]),
    strength_training: new Set(),
    powerlifting: new Set(),
    hiit: new Set(["duration"]),
    functional_fitness: new Set(["duration", "rounds", "score"]),
    other: new Set(["duration"]),
  };
  workout.metrics.forEach((metric, index) => {
    if (seen.has(metric.metricType)) {
      context.addIssue({ code: "custom", message: "Each metric can only be added once", path: ["metrics", index, "metricType"] });
    }
    seen.add(metric.metricType);
    if (!allowedMetricTypes[workout.workoutType].has(metric.metricType)) {
      context.addIssue({ code: "custom", message: "This result does not apply to the selected workout type", path: ["metrics", index, "metricType"] });
    }
  });
  if (workout.format && workout.workoutType !== "functional_fitness") {
    context.addIssue({
      code: "custom",
      message: "Formats are only supported for Functional Fitness",
      path: ["format"],
    });
  }
  if (workout.format) {
    if (workout.metrics.length) {
      context.addIssue({
        code: "custom",
        message: "Format workouts cannot include metrics",
        path: ["metrics"],
      });
    }
    if (workout.segments.length) {
      context.addIssue({
        code: "custom",
        message: "Format workouts cannot include segments",
        path: ["segments"],
      });
    }
    if (workout.movements.length < 1 || workout.movements.length > 20) {
      context.addIssue({
        code: "custom",
        message: "Add between 1 and 20 exercises",
        path: ["movements"],
      });
    }
    let totalSets = 0;
    workout.movements.forEach((movement, index) => {
      if (movement.sets.length < 1 || movement.sets.length > 20) {
        context.addIssue({
          code: "custom",
          message: "Each exercise can have between 1 and 20 sets",
          path: ["movements", index, "sets"],
        });
      }
      totalSets += movement.sets.length;
    });
    if (totalSets > 100) {
      context.addIssue({
        code: "custom",
        message: "A workout can have at most 100 sets",
        path: ["movements"],
      });
    }
  }
  const allowsMovements = ["strength_training", "powerlifting"].includes(workout.workoutType)
    || Boolean(workout.workoutType === "functional_fitness" && workout.format);
  if (workout.movements.length && !allowsMovements) {
    context.addIssue({ code: "custom", message: "Exercises are only supported for strength workouts", path: ["movements"] });
  }
  if (workout.workoutSubtype && workout.workoutType !== "run") {
    context.addIssue({ code: "custom", message: "Workout subtype is only supported for Run", path: ["workoutSubtype"] });
  }
  if (workout.segments.length && (workout.workoutType !== "run" || workout.workoutSubtype !== "interval")) {
    context.addIssue({ code: "custom", message: "Segments currently require an Interval Run", path: ["segments"] });
  }
  if (workout.workoutSubtype === "interval" && workout.segments.length === 0) {
    context.addIssue({ code: "custom", message: "Add at least one interval segment", path: ["segments"] });
  }
  const segmentPositions = new Set<number>();
  workout.segments.forEach((segment, index) => {
    if (segmentPositions.has(segment.position)) {
      context.addIssue({ code: "custom", message: "Segment positions must be unique", path: ["segments", index, "position"] });
    }
    segmentPositions.add(segment.position);
  });
});

export const createWorkoutSchema = z.object({
  workoutType: canonicalWorkoutTypeSchema,
  workoutSubtype: z.enum(runWorkoutSubtypes).nullable().optional().default(null),
  name: z
    .string()
    .trim()
    .max(120)
    .optional(),
  durationMinutes: z.number().int().min(1).max(1_440).nullable().optional().default(null),
  effort: z.number().int().min(1).max(5).nullable().optional().default(null),
  caption: z
    .string()
    .trim()
    .max(2_000)
    .optional(),
  photoPath: z.string().trim().max(500).nullable().optional().default(null),
  occurredAt: z.iso.datetime().optional(),
  logVersion: z.number().int().positive().nullable().optional().default(null),
  format: workoutFormatSchema.nullable().optional(),
  // Accepted only to normalize requests from clients deployed before v1.
  title: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
  completedAt: z.iso.datetime().optional(),
  metrics: z.array(workoutMetricSchema).max(20).optional().default([]),
  movements: z.array(workoutMovementInputSchema).max(50).optional().default([]),
  segments: z.array(workoutSessionSegmentSchema).max(500).optional().default([]),
}).superRefine((workout, context) => {
  if (!workout.occurredAt && !workout.completedAt) {
    context.addIssue({ code: "custom", message: "Workout date and time are required", path: ["occurredAt"] });
  }
}).transform((workout) => {
  const durationSeconds = workout.metrics.find((metric) => metric.metricType === "duration")?.numericValue;
  const format = normalizeFormat(workout.format);
  return {
    workoutType: workout.workoutType,
    workoutSubtype: workout.workoutSubtype,
    name: workout.name !== undefined ? workout.name || null : workout.title ?? null,
    durationMinutes: durationMinutesFromFormat(
      format,
      durationSeconds == null
        ? workout.durationMinutes
        : Math.max(1, Math.min(1_440, Math.round(durationSeconds / 60))),
    ),
    effort: workout.effort,
    caption: workout.caption !== undefined ? workout.caption || null : workout.notes ?? null,
    photoPath: workout.photoPath,
    occurredAt: workout.occurredAt ?? workout.completedAt ?? "",
    logVersion: workout.logVersion ?? null,
    format,
    metrics: workout.metrics,
    movements: workout.movements,
    segments: workout.segments,
  };
}).pipe(canonicalWorkoutSchema);

export function workoutWriteFields(
  workout: z.infer<typeof createWorkoutSchema>,
) {
  return {
    workoutType: workout.workoutType,
    workoutSubtype: workout.workoutSubtype,
    name: workout.name,
    durationMinutes: workout.durationMinutes,
    effort: workout.effort,
    caption: workout.caption,
    photoPath: workout.photoPath,
    occurredAt: workout.occurredAt,
    metrics: workout.metrics,
    movements: workout.movements,
    segments: workout.segments,
    ...formatToColumns(workout.format),
  };
}

export const movementSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  recent: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

export const movementLastSessionQuerySchema = z.object({
  movementId: z.uuid().optional(),
  movementName: movementNameSchema.optional(),
  excludeSessionId: z.uuid().optional(),
}).superRefine((query, context) => {
  const hasId = Boolean(query.movementId);
  const hasName = Boolean(query.movementName);
  if (hasId === hasName) {
    context.addIssue({
      code: "custom",
      message: "Provide movementId or movementName",
      path: [hasId ? "movementName" : "movementId"],
    });
  }
});

export const homeQuerySchema = z.object({
  view: z.enum(["home", "community", "profile"]).optional(),
  groupId: z.uuid().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
  includeReactions: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  includeComments: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
}).superRefine((query, context) => {
  if (Boolean(query.start) !== Boolean(query.end)) {
    context.addIssue({ code: "custom", message: "Start and end must be supplied together", path: [query.start ? "end" : "start"] });
    return;
  }
  if (!query.start || !query.end) return;
  const start = new Date(query.start).getTime();
  const end = new Date(query.end).getTime();
  if (end <= start) {
    context.addIssue({ code: "custom", message: "End must be after start", path: ["end"] });
  } else if (end - start > 26 * 60 * 60 * 1_000) {
    context.addIssue({ code: "custom", message: "The requested range must represent one calendar day", path: ["end"] });
  }
});
