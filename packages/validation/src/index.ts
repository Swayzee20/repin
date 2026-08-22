import { z } from "zod";

import { workoutTypes } from "@repin/types";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const groupIdSchema = z.uuid();

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

const canonicalWorkoutSchema = z.object({
  workoutType: z.enum(workoutTypes),
  name: z.string().nullable(),
  durationMinutes: z.number().int().min(1).max(1_440).nullable(),
  effort: z.number().int().min(1).max(5).nullable(),
  caption: z.string().max(2_000).nullable(),
  photoPath: z.string().max(500).nullable(),
  occurredAt: z.iso.datetime(),
}).superRefine((workout, context) => {
  if (["run", "walk", "hiit"].includes(workout.workoutType) && workout.durationMinutes === null) {
    context.addIssue({ code: "custom", message: "Duration is required for this workout type", path: ["durationMinutes"] });
  }
});

export const createWorkoutSchema = z.object({
  workoutType: canonicalWorkoutTypeSchema,
  name: z
    .string()
    .trim()
    .max(120)
    .optional(),
  durationMinutes: z.number().int().min(1).max(1_440).nullable(),
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
}).superRefine((workout, context) => {
  if (!workout.occurredAt && !workout.completedAt) {
    context.addIssue({ code: "custom", message: "Workout date and time are required", path: ["occurredAt"] });
  }
}).transform((workout) => ({
  workoutType: workout.workoutType,
  name: workout.name !== undefined ? workout.name || null : workout.title ?? null,
  durationMinutes: workout.durationMinutes,
  effort: workout.effort,
  caption: workout.caption !== undefined ? workout.caption || null : workout.notes ?? null,
  photoPath: workout.photoPath,
  occurredAt: workout.occurredAt ?? workout.completedAt ?? "",
})).pipe(canonicalWorkoutSchema);

export const homeQuerySchema = z.object({
  groupId: z.uuid().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
