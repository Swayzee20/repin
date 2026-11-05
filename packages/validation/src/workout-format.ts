import { z } from "zod";

import {
  workoutFormats,
  type WorkoutEditState,
  type WorkoutFormat,
  type WorkoutFormatColumns,
  type WorkoutFormatDetail,
} from "@repin/types";

const amrapScoreSchema = z
  .object({
    rounds: z.number().int().min(0),
    reps: z.number().int().min(0).optional().default(0),
  })
  .strict();

export const amrapFormatSchema = z
  .object({
    type: z.literal("amrap"),
    durationSeconds: z.number().int().min(60).max(10_800).nullable().optional(),
    score: amrapScoreSchema,
  })
  .strict();

const forTimeFinishedScoreSchema = z
  .object({
    finished: z.literal(true),
    timeSeconds: z.number().int().positive(),
  })
  .strict();

const forTimeCappedScoreSchema = z
  .object({
    finished: z.literal(false),
    reps: z.number().int().min(0),
  })
  .strict();

export const forTimeFormatSchema = z
  .object({
    type: z.literal("for_time"),
    timeCapSeconds: z.number().int().positive().nullable().optional(),
    rounds: z.number().int().positive().nullable().optional(),
    score: z.union([forTimeFinishedScoreSchema, forTimeCappedScoreSchema]).nullable().optional(),
  })
  .strict()
  .superRefine((format, context) => {
    if (
      format.score?.finished === true
      && format.timeCapSeconds != null
      && !(format.score.timeSeconds > 0 && format.score.timeSeconds < format.timeCapSeconds)
    ) {
      context.addIssue({
        code: "custom",
        message: "Finish time must be under the cap",
        path: ["score", "timeSeconds"],
      });
    }
    if (format.score?.finished === false && format.timeCapSeconds == null) {
      context.addIssue({
        code: "custom",
        message: "A time cap is required when the workout is capped",
        path: ["timeCapSeconds"],
      });
    }
  });

export const emomFormatSchema = z
  .object({
    type: z.literal("emom"),
    durationSeconds: z.number().int().min(60).max(10_800),
    intervalSeconds: z.number().int().positive().optional().default(60),
    score: z.null().optional().default(null),
  })
  .strict();

export const roundsFormatSchema = z
  .object({
    type: z.literal("rounds"),
    rounds: z.number().int().min(1),
    score: z.object({ timeSeconds: z.number().int().positive() }).strict().nullable().optional(),
  })
  .strict();

export const workoutFormatSchema = z.discriminatedUnion("type", [
  amrapFormatSchema,
  forTimeFormatSchema,
  emomFormatSchema,
  roundsFormatSchema,
]);

export const canonicalWorkoutFormatSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("amrap"),
    durationSeconds: z.number().int().min(60).max(10_800).nullable(),
    score: z.object({
      rounds: z.number().int().min(0),
      reps: z.number().int().min(0),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("for_time"),
    timeCapSeconds: z.number().int().positive().nullable(),
    rounds: z.number().int().positive().nullable(),
    score: z.union([
      z.object({ finished: z.literal(true), timeSeconds: z.number().int().positive() }).strict(),
      z.object({ finished: z.literal(false), reps: z.number().int().min(0) }).strict(),
    ]).nullable(),
  }).strict(),
  z.object({
    type: z.literal("emom"),
    durationSeconds: z.number().int().min(60).max(10_800).nullable(),
    intervalSeconds: z.number().int().positive().nullable(),
    score: z.null(),
  }).strict(),
  z.object({
    type: z.literal("rounds"),
    rounds: z.number().int().min(1),
    score: z.object({ timeSeconds: z.number().int().positive() }).strict().nullable(),
  }).strict(),
]);

export function normalizeFormat(
  format: z.infer<typeof workoutFormatSchema> | null | undefined,
): WorkoutFormatDetail | null {
  if (!format) return null;
  switch (format.type) {
    case "amrap":
      return {
        type: "amrap",
        durationSeconds: format.durationSeconds ?? null,
        score: { rounds: format.score.rounds, reps: format.score.reps ?? 0 },
      };
    case "for_time":
      return {
        type: "for_time",
        timeCapSeconds: format.timeCapSeconds ?? null,
        rounds: format.rounds ?? null,
        score: format.score ?? null,
      };
    case "emom":
      return {
        type: "emom",
        durationSeconds: format.durationSeconds,
        intervalSeconds: format.intervalSeconds ?? 60,
        score: null,
      };
    case "rounds":
      return {
        type: "rounds",
        rounds: format.rounds,
        score: format.score ?? null,
      };
  }
}

export function emptyFormatColumns(): WorkoutFormatColumns {
  return {
    workoutFormat: null,
    formatDurationSeconds: null,
    formatIntervalSeconds: null,
    formatRounds: null,
    timeCapSeconds: null,
    scoreFinished: null,
    scoreTimeSeconds: null,
    scoreRounds: null,
    scoreReps: null,
  };
}

export function formatToColumns(
  format: WorkoutFormatDetail | null | undefined,
): WorkoutFormatColumns {
  const empty = emptyFormatColumns();
  if (!format) return empty;

  switch (format.type) {
    case "amrap":
      return {
        ...empty,
        workoutFormat: "amrap",
        formatDurationSeconds: format.durationSeconds ?? null,
        scoreRounds: format.score?.rounds ?? null,
        scoreReps: format.score?.reps ?? null,
      };
    case "for_time":
      return {
        ...empty,
        workoutFormat: "for_time",
        timeCapSeconds: format.timeCapSeconds ?? null,
        formatRounds: format.rounds ?? null,
        scoreFinished: format.score?.finished ?? null,
        scoreTimeSeconds: format.score?.finished === true ? format.score.timeSeconds : null,
        scoreReps: format.score?.finished === false ? format.score.reps : null,
      };
    case "emom":
      return {
        ...empty,
        workoutFormat: "emom",
        formatDurationSeconds: format.durationSeconds ?? null,
        formatIntervalSeconds: format.intervalSeconds ?? null,
      };
    case "rounds":
      return {
        ...empty,
        workoutFormat: "rounds",
        formatRounds: format.rounds,
        scoreTimeSeconds: format.score?.timeSeconds ?? null,
      };
  }
}

export function columnsToFormat(columns: WorkoutFormatColumns): WorkoutFormatDetail | null {
  switch (columns.workoutFormat) {
    case "amrap":
      return {
        type: "amrap",
        durationSeconds: columns.formatDurationSeconds,
        score: columns.scoreRounds == null
          ? null
          : { rounds: columns.scoreRounds, reps: columns.scoreReps ?? 0 },
      };
    case "for_time":
      return {
        type: "for_time",
        timeCapSeconds: columns.timeCapSeconds,
        rounds: columns.formatRounds,
        score: columns.scoreFinished == null
          ? null
          : columns.scoreFinished
            ? { finished: true, timeSeconds: columns.scoreTimeSeconds ?? 0 }
            : { finished: false, reps: columns.scoreReps ?? 0 },
      };
    case "emom":
      return {
        type: "emom",
        durationSeconds: columns.formatDurationSeconds,
        intervalSeconds: columns.formatIntervalSeconds,
        score: null,
      };
    case "rounds":
      return {
        type: "rounds",
        rounds: columns.formatRounds ?? 0,
        score: columns.scoreTimeSeconds == null
          ? null
          : { timeSeconds: columns.scoreTimeSeconds },
      };
    default:
      return null;
  }
}

export function durationMinutesFromFormat(
  format: WorkoutFormatDetail | null | undefined,
  fallback: number | null,
) {
  if (!format) return fallback;
  switch (format.type) {
    case "amrap":
    case "emom":
      return secondsToDurationMinutes(format.durationSeconds) ?? fallback;
    case "for_time":
      if (format.score?.finished === true) {
        return secondsToDurationMinutes(format.score.timeSeconds) ?? fallback;
      }
      if (format.score?.finished === false) {
        return secondsToDurationMinutes(format.timeCapSeconds) ?? fallback;
      }
      return fallback;
    case "rounds":
      return secondsToDurationMinutes(format.score?.timeSeconds ?? null) ?? fallback;
  }
}

function secondsToDurationMinutes(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return null;
  return Math.max(1, Math.min(1_440, Math.ceil(seconds / 60)));
}

export function requiresUpdatedClient(
  stored: WorkoutEditState,
  request: { logVersion?: number | null },
) {
  if (request.logVersion === 2) return false;
  return stored.workoutFormat != null
    || stored.workoutType === "cycling"
    || stored.hasMeterDistance;
}

export function isWorkoutFormat(value: string | null | undefined): value is WorkoutFormat {
  return value != null && (workoutFormats as readonly string[]).includes(value);
}
