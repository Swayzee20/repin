import {
  workoutDistanceUnits,
  workoutTypeLabels,
  workoutTypes,
  type QuickLogMetricInput,
  type WorkoutDetailMetric,
  type WorkoutDistanceUnit,
  type WorkoutType,
} from "@repin/types";

import { getDurationSeconds, validateTimeParts } from "../lib/workout-time";

export const clientLogVersion = 2 as const;

export const hiitExerciseHelper = "To list exercises, pick Functional Fitness.";

export const functionalFitnessFormatsLabel = "AMRAP · For Time · EMOM · Rounds";

export const workoutTypeGridAlign = "center" as const;

export const workoutTypeSelectorOptions: { label: string; value: WorkoutType }[] = workoutTypes.map((value) => ({
  label: workoutTypeLabels[value],
  value,
}));

export const runWalkDistanceUnitOptions = [
  { label: "mi", value: "mi" },
  { label: "km", value: "km" },
  { label: "m", value: "m" },
] as const satisfies readonly { label: string; value: WorkoutDistanceUnit }[];

export const cyclingDistanceUnitOptions = [
  { label: "mi", value: "mi" },
  { label: "km", value: "km" },
] as const satisfies readonly { label: string; value: WorkoutDistanceUnit }[];

type FunctionalResultType = "time" | "rounds" | "score";

export interface QuickLogResultsDraft {
  distance: string;
  distanceUnit: WorkoutDistanceUnit;
  timeMinutes: string;
  timeSeconds: string;
  functionalResultType: FunctionalResultType | null;
  rounds: string;
  score: string;
}

export const emptyQuickLogResults: QuickLogResultsDraft = {
  distance: "",
  distanceUnit: "mi",
  timeMinutes: "",
  timeSeconds: "",
  functionalResultType: null,
  rounds: "",
  score: "",
};

export function attachLogVersion<T extends Record<string, unknown>>(body: T) {
  return { ...body, logVersion: clientLogVersion };
}

export function workoutTypeSheetMeta(workoutType: WorkoutType) {
  if (workoutType === "cycling") return { badge: "New" as const, subtitle: null };
  if (workoutType === "functional_fitness") return { badge: null, subtitle: functionalFitnessFormatsLabel };
  return { badge: null, subtitle: null };
}

export function workoutTypeSheetAccessibilityLabel(workoutType: WorkoutType) {
  const label = workoutTypeLabels[workoutType];
  const meta = workoutTypeSheetMeta(workoutType);
  if (meta.badge) return `${label}, ${meta.badge}`;
  if (meta.subtitle) return `${label}, ${meta.subtitle}`;
  return label;
}

export function isDistanceWorkout(workoutType: WorkoutType | null) {
  return workoutType === "run" || workoutType === "walk" || workoutType === "cycling";
}

export function usesHoursTime(workoutType: WorkoutType | null) {
  return workoutType === "cycling" || workoutType === "hiit";
}

export function usesMetricFields(workoutType: WorkoutType | null) {
  return workoutType === "walk"
    || workoutType === "cycling"
    || workoutType === "hiit"
    || workoutType === "functional_fitness"
    || workoutType === "other";
}

export function usesMovementPicker(workoutType: WorkoutType | null) {
  return workoutType === "strength_training"
    || workoutType === "powerlifting"
    || workoutType === "functional_fitness";
}

export function distanceUnitOptions(workoutType: WorkoutType | null, current?: WorkoutDistanceUnit) {
  if (workoutType === "cycling") {
    if (current === "m") {
      return [...cyclingDistanceUnitOptions, { label: "m", value: "m" as const }];
    }
    return [...cyclingDistanceUnitOptions];
  }
  return [...runWalkDistanceUnitOptions];
}

export function hydrateDistanceUnit(unit: string | null | undefined): WorkoutDistanceUnit {
  if (unit != null && (workoutDistanceUnits as readonly string[]).includes(unit)) {
    return unit as WorkoutDistanceUnit;
  }
  return "mi";
}

export function distancePlaceholder(workoutType: WorkoutType | null, unit: WorkoutDistanceUnit) {
  if (unit === "m") return "400";
  if (workoutType === "cycling") return "18.2";
  return "3.2";
}

export function splitDurationMinutes(totalMinutes: string) {
  const text = totalMinutes.trim();
  if (!text) return { hours: "", minutes: "" };
  const total = Number(text);
  if (!Number.isFinite(total) || total < 0) return { hours: "", minutes: totalMinutes };
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return { hours: "", minutes: String(minutes) };
  return { hours: String(hours), minutes: String(minutes) };
}

export function joinDurationMinutes(hours: string, minutes: string) {
  const hoursText = hours.trim();
  const minutesText = minutes.trim();
  if (!hoursText && !minutesText) return "";
  const hoursValue = hoursText ? Number(hoursText) : 0;
  const minutesValue = minutesText ? Number(minutesText) : 0;
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) return minutesText;
  return String(hoursValue * 60 + minutesValue);
}

export function hoursRangeError(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return "Hours must be a non-negative whole number.";
  const hours = Number(text);
  if (!Number.isSafeInteger(hours) || hours < 0) return "Hours must be a non-negative whole number.";
  return null;
}

export function formatAverageSpeed(distance: number, unit: WorkoutDistanceUnit, durationSeconds: number) {
  if (!(distance > 0) || !(durationSeconds > 0) || unit === "m") return null;
  const hours = durationSeconds / 3_600;
  const speed = distance / hours;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    useGrouping: false,
  }).format(speed);
  return unit === "km" ? `Avg ${formatted} km/h` : `Avg ${formatted} mph`;
}

export function averageSpeedHelper(value: QuickLogResultsDraft) {
  const distance = Number(value.distance);
  const durationSeconds = getDurationSeconds(value.timeMinutes, value.timeSeconds);
  if (!Number.isFinite(distance) || durationSeconds == null) return null;
  return formatAverageSpeed(distance, value.distanceUnit, durationSeconds);
}

export function hydrateQuickLogResults(metrics: WorkoutDetailMetric[]): QuickLogResultsDraft {
  const distance = metrics.find((metric) => metric.metricType === "distance");
  const duration = metrics.find((metric) => metric.metricType === "duration");
  const rounds = metrics.find((metric) => metric.metricType === "rounds");
  const score = metrics.find((metric) => metric.metricType === "score");
  const durationSeconds = duration?.numericValue == null ? null : Math.round(duration.numericValue);
  return {
    distance: distance?.numericValue == null ? "" : String(distance.numericValue),
    distanceUnit: hydrateDistanceUnit(distance?.unit),
    timeMinutes: durationSeconds == null ? "" : String(Math.floor(durationSeconds / 60)),
    timeSeconds: durationSeconds == null ? "" : String(durationSeconds % 60),
    functionalResultType: duration ? "time" : rounds ? "rounds" : score ? "score" : null,
    rounds: rounds?.numericValue == null ? "" : String(rounds.numericValue),
    score: score?.textValue ?? "",
  };
}

function usesTimeFields(workoutType: WorkoutType, value: QuickLogResultsDraft) {
  return isDistanceWorkout(workoutType)
    || workoutType === "hiit"
    || workoutType === "other"
    || (workoutType === "functional_fitness" && value.functionalResultType === "time");
}

export function validateQuickLogResults(value: QuickLogResultsDraft, workoutType: WorkoutType) {
  if (isDistanceWorkout(workoutType) && value.distance.trim()) {
    const distance = Number(value.distance);
    if (!Number.isFinite(distance) || distance <= 0) return "Distance must be greater than zero.";
  }
  if (usesHoursTime(workoutType)) {
    const { hours } = splitDurationMinutes(value.timeMinutes);
    const hoursError = hoursRangeError(hours);
    if (hoursError) return hoursError;
  }
  if (usesTimeFields(workoutType, value)) {
    const timeValidationError = validateTimeParts(value.timeMinutes, value.timeSeconds);
    if (timeValidationError) return timeValidationError;
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "rounds" && value.rounds.trim()) {
    const rounds = Number(value.rounds);
    if (!Number.isInteger(rounds) || rounds <= 0) return "Rounds must be a positive whole number.";
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "score" && !value.score.trim()) {
    return "Enter a score or clear the Score result type.";
  }
  return null;
}

export function buildQuickLogResults(value: QuickLogResultsDraft, workoutType: WorkoutType) {
  const metrics: QuickLogMetricInput[] = [];
  if (isDistanceWorkout(workoutType) && value.distance.trim()) {
    metrics.push({ metricType: "distance", numericValue: Number(value.distance), unit: value.distanceUnit });
  }
  const durationSeconds = usesTimeFields(workoutType, value)
    ? getDurationSeconds(value.timeMinutes, value.timeSeconds)
    : null;
  if (durationSeconds != null) metrics.push({ metricType: "duration", numericValue: durationSeconds, unit: "seconds" });
  if (workoutType === "functional_fitness" && value.functionalResultType === "rounds" && value.rounds.trim()) {
    metrics.push({ metricType: "rounds", numericValue: Number(value.rounds), unit: "rounds" });
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "score" && value.score.trim()) {
    metrics.push({ metricType: "score", textValue: value.score.trim() });
  }

  return { metrics, durationSeconds };
}
