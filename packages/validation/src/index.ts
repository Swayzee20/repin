import { z } from "zod";

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

export const createWorkoutSchema = z.object({
  workoutType: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(1_440),
  notes: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .transform((notes) => notes || null),
  completedAt: z.iso.datetime(),
});

export const homeQuerySchema = z.object({
  groupId: z.uuid().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
