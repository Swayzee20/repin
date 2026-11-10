import {
  workoutTypeLabels,
  workoutTypes,
  type DistancePrLane,
  type GoalDetail,
  type GoalKind,
  type GoalSchedule,
  type WorkoutType,
} from "@repin/types";
import {
  createGoalSchema,
  resolvedSchedule,
  resolvedVolumeMetric,
  type VolumeMetric,
} from "@repin/validation";

const LB_TO_KG = 0.45359237;
const METERS_PER_MILE = 1_609.344;

export const goalKindTiles: { label: string; value: GoalKind }[] = [
  { label: "Volume", value: "volume" },
  { label: "Time", value: "time" },
  { label: "Lift", value: "lift" },
];

export const volumeMetricTiles: { label: string; value: VolumeMetric }[] = [
  { label: "Distance", value: "distance" },
  { label: "Workouts", value: "workout_count" },
  { label: "Minutes", value: "minutes" },
];

export const distanceVolumeSports: { label: string; value: WorkoutType | null }[] = [
  { label: "Run", value: "run" },
  { label: "Walk", value: "walk" },
  { label: "Ride", value: "cycling" },
  { label: "All sports", value: null },
];

export const countedVolumeSports: { label: string; value: WorkoutType | null }[] = [
  ...workoutTypes.map((value) => ({
    label: value === "cycling" ? "Ride" : workoutTypeLabels[value],
    value,
  })),
  { label: "All sports", value: null },
];

export function volumeSportsFor(metric: VolumeMetric) {
  return metric === "distance" ? distanceVolumeSports : countedVolumeSports;
}

export const volumeSportTiles = distanceVolumeSports;

export const timeSportTiles: { label: string; value: "run" | "walk" | "cycling" }[] = [
  { label: "Run", value: "run" },
  { label: "Walk", value: "walk" },
  { label: "Ride", value: "cycling" },
];

export const laneTiles: { label: string; value: DistancePrLane }[] = [
  { label: "1 mi", value: "1mi" },
  { label: "5K", value: "5k" },
  { label: "10K", value: "10k" },
  { label: "Half", value: "half" },
  { label: "Marathon", value: "marathon" },
];

export const scheduleTiles: { label: string; value: GoalSchedule }[] = [
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "One-time", value: "one_time" },
];

export type GoalFormDraft = {
  deadline: Date | null;
  displayUnit: string;
  kind: GoalKind;
  lane: DistancePrLane;
  movementId: string | null;
  movementName: string;
  schedule: GoalSchedule;
  sportFilter: WorkoutType | null;
  targetMinutes: string;
  targetSeconds: string;
  targetText: string;
  timeSport: "run" | "walk" | "cycling";
  volumeMetric: VolumeMetric;
};

export function emptyGoalForm(): GoalFormDraft {
  return {
    deadline: null,
    displayUnit: "mi",
    kind: "volume",
    lane: "5k",
    movementId: null,
    movementName: "",
    schedule: "weekly",
    sportFilter: "run",
    targetMinutes: "20",
    targetSeconds: "00",
    targetText: "5",
    timeSport: "run",
    volumeMetric: "distance",
  };
}

export function hydrateGoalForm(goal: GoalDetail): GoalFormDraft {
  const draft = emptyGoalForm();
  draft.kind = goal.kind;
  draft.volumeMetric = goal.metric === "distance" || goal.metric === "workout_count" || goal.metric === "minutes"
    ? goal.metric
    : "distance";
  draft.sportFilter = goal.sportFilter;
  draft.timeSport = goal.sportFilter === "walk" || goal.sportFilter === "cycling" ? goal.sportFilter : "run";
  draft.lane = goal.lane ?? "5k";
  draft.schedule = goal.schedule;
  draft.displayUnit = goal.displayUnit ?? (goal.kind === "lift" ? "lb" : draft.volumeMetric === "distance" ? "mi" : "");
  draft.movementId = goal.movementId;
  draft.movementName = goal.movementName ?? "";
  draft.deadline = goal.deadlineAt ? new Date(goal.deadlineAt) : null;
  if (goal.kind === "time") {
    const total = Math.round(goal.targetValue);
    draft.targetMinutes = String(Math.floor(total / 60));
    draft.targetSeconds = String(total % 60).padStart(2, "0");
    draft.targetText = String(total);
  } else {
    draft.targetText = displayTargetText(goal);
  }
  return draft;
}

export function displayTargetText(goal: Pick<GoalDetail, "kind" | "metric" | "targetValue" | "displayUnit">) {
  if (goal.kind === "lift") {
    if (goal.displayUnit === "kg") return formatDisplayNumber(Math.round(goal.targetValue * 10) / 10);
    return formatDisplayNumber(Math.round((goal.targetValue / LB_TO_KG) * 10) / 10);
  }
  if (goal.metric === "distance") {
    if (goal.displayUnit === "km") return formatDisplayNumber(goal.targetValue / 1_000);
    if (goal.displayUnit === "m") return formatDisplayNumber(goal.targetValue);
    return formatDisplayNumber(goal.targetValue / METERS_PER_MILE);
  }
  if (goal.metric === "minutes") {
    return String(Math.round(goal.targetValue / 60));
  }
  return formatDisplayNumber(goal.targetValue);
}

function formatDisplayNumber(value: number) {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function goalFormPayload(draft: GoalFormDraft, timeZone: string) {
  const target = draft.kind === "time"
    ? Number(draft.targetMinutes || "0") * 60 + Number(draft.targetSeconds || "0")
    : Number(draft.targetText);
  return {
    deadlineAt: draft.deadline ? draft.deadline.toISOString() : null,
    displayUnit: draft.kind === "volume" && draft.volumeMetric !== "distance"
      ? (draft.volumeMetric === "minutes" ? "min" : "count")
      : (draft.displayUnit || null),
    kind: draft.kind,
    lane: draft.kind === "time" ? draft.lane : undefined,
    metric: resolvedVolumeMetric(
      draft.kind,
      draft.kind === "volume" ? draft.volumeMetric : undefined,
    ),
    movementId: draft.kind === "lift" ? draft.movementId : null,
    movementName: draft.kind === "lift" ? draft.movementName.trim() || null : null,
    schedule: resolvedSchedule(draft.kind, draft.kind === "volume" ? draft.schedule : "one_time"),
    sportFilter: draft.kind === "time"
      ? draft.timeSport
      : draft.kind === "volume" ? draft.sportFilter : null,
    target,
    targetMinutes: draft.kind === "time" ? Number(draft.targetMinutes || "0") : undefined,
    targetSeconds: draft.kind === "time" ? Number(draft.targetSeconds || "0") : undefined,
    timeZone,
  };
}

export function validateGoalForm(draft: GoalFormDraft, timeZone: string) {
  if (!timeZone.trim()) {
    return "Choose a valid time zone";
  }
  const parsed = createGoalSchema.safeParse(goalFormPayload(draft, timeZone));
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Goal details are invalid";
}

export function formatGoalDate(value: Date | null) {
  if (!value) return "None";
  return value.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function percentLabel(ratio: number) {
  return `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
}
