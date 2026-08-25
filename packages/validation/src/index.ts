import { z } from "zod";

import { workoutMetricTypes, workoutTypes } from "@repin/types";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const groupIdSchema = z.uuid();
export const workoutSessionIdSchema = z.uuid();

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
      if (!(["mi", "km"] as const).includes(metric.unit as "mi" | "km")) {
        context.addIssue({ code: "custom", message: "Distance must use mi or km", path: ["unit"] });
      }
    }
    if (metric.metricType === "rounds" && (!hasNumeric || !Number.isInteger(metric.numericValue) || (metric.numericValue ?? 0) <= 0)) {
      context.addIssue({ code: "custom", message: "Rounds must be a positive whole number", path: ["numericValue"] });
    }
    if (metric.metricType === "score" && !hasText) {
      context.addIssue({ code: "custom", message: "Enter a score", path: ["textValue"] });
    }
  });

const workoutSetSchema = z
  .object({
    reps: z.number().int().positive().nullable().optional(),
    load: z.number().finite().min(0).nullable().optional(),
    loadUnit: z.enum(["lb", "kg"]).nullable().optional(),
  })
  .strict()
  .superRefine((set, context) => {
    if (set.reps == null && set.load == null) {
      context.addIssue({ code: "custom", message: "Add at least one result to this set" });
    }
    if (set.load != null && !set.loadUnit) {
      context.addIssue({ code: "custom", message: "Choose lb or kg", path: ["loadUnit"] });
    }
  });

const workoutMovementSchema = z
  .object({
    movementId: z.uuid().nullable().optional(),
    movementName: z.string().trim().min(1, "Exercise name is required").max(160),
    sets: z.array(workoutSetSchema).max(100),
  })
  .strict();

const canonicalWorkoutSchema = z.object({
  workoutType: z.enum(workoutTypes),
  name: z.string().nullable(),
  durationMinutes: z.number().int().min(1).max(1_440).nullable(),
  effort: z.number().int().min(1).max(5).nullable(),
  caption: z.string().max(2_000).nullable(),
  photoPath: z.string().max(500).nullable(),
  occurredAt: z.iso.datetime(),
  metrics: z.array(workoutMetricSchema).max(20),
  movements: z.array(workoutMovementSchema).max(50),
}).superRefine((workout, context) => {
  const seen = new Set<string>();
  const allowedMetricTypes: Record<(typeof workoutTypes)[number], Set<string>> = {
    run: new Set(["distance", "duration"]),
    walk: new Set(["distance", "duration"]),
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
  if (workout.movements.length && !["strength_training", "powerlifting"].includes(workout.workoutType)) {
    context.addIssue({ code: "custom", message: "Exercises are only supported for strength workouts", path: ["movements"] });
  }
});

export const createWorkoutSchema = z.object({
  workoutType: canonicalWorkoutTypeSchema,
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
  // Accepted only to normalize requests from clients deployed before v1.
  title: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
  completedAt: z.iso.datetime().optional(),
  metrics: z.array(workoutMetricSchema).max(20).optional().default([]),
  movements: z.array(workoutMovementSchema).max(50).optional().default([]),
}).superRefine((workout, context) => {
  if (!workout.occurredAt && !workout.completedAt) {
    context.addIssue({ code: "custom", message: "Workout date and time are required", path: ["occurredAt"] });
  }
}).transform((workout) => {
  const durationSeconds = workout.metrics.find((metric) => metric.metricType === "duration")?.numericValue;
  return {
    workoutType: workout.workoutType,
    name: workout.name !== undefined ? workout.name || null : workout.title ?? null,
    durationMinutes: durationSeconds == null
      ? workout.durationMinutes
      : Math.max(1, Math.min(1_440, Math.round(durationSeconds / 60))),
    effort: workout.effort,
    caption: workout.caption !== undefined ? workout.caption || null : workout.notes ?? null,
    photoPath: workout.photoPath,
    occurredAt: workout.occurredAt ?? workout.completedAt ?? "",
    metrics: workout.metrics,
    movements: workout.movements,
  };
}).pipe(canonicalWorkoutSchema);

export const movementSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
});

export const homeQuerySchema = z.object({
  groupId: z.uuid().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
