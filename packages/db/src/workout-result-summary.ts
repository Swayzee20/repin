import {
  formatGroupedIntervalSegment,
  groupConsecutiveIntervalSegments,
  type IntervalPresentationSegment,
  type RunWorkoutSubtype,
} from "@repin/types";

interface WorkoutResultMetric {
  metricType: string;
  numericValue: number | null;
  textValue: string | null;
  unit: string | null;
}

interface WorkoutResultSet {
  reps: number | null;
  load: number | null;
  loadUnit: string | null;
}

export interface WorkoutResultMovement {
  movementName: string;
  sets: WorkoutResultSet[];
}

export function formatWorkoutResultSummary(input: {
  workoutType: string;
  workoutSubtype?: RunWorkoutSubtype | null;
  metrics: WorkoutResultMetric[];
  movements: WorkoutResultMovement[];
  segments?: IntervalPresentationSegment[];
}) {
  switch (input.workoutType) {
    case "run": {
      if (input.workoutSubtype === "interval" && input.segments?.length) {
        const groups = groupConsecutiveIntervalSegments(input.segments);
        const first = groups[0];
        if (first) {
          const summary = formatGroupedIntervalSegment(first).summary;
          return truncateSummary(groups.length > 1 ? `${summary} · +${groups.length - 1} more` : summary);
        }
      }
      return joinSummaryParts([
        formatDistance(findMetric(input.metrics, "distance")),
        formatDuration(findMetric(input.metrics, "duration")),
      ]);
    }
    case "walk":
      return joinSummaryParts([
        formatDistance(findMetric(input.metrics, "distance")),
        formatDuration(findMetric(input.metrics, "duration")),
      ]);
    case "hiit":
    case "other":
      return formatDuration(findMetric(input.metrics, "duration"));
    case "functional_fitness":
      return (
        formatDuration(findMetric(input.metrics, "duration")) ??
        formatRounds(findMetric(input.metrics, "rounds")) ??
        formatScore(findMetric(input.metrics, "score"))
      );
    case "strength_training":
    case "powerlifting":
      return formatMovementSummary(input.movements);
    default:
      return null;
  }
}

function findMetric(metrics: WorkoutResultMetric[], metricType: string) {
  return metrics.find((metric) => metric.metricType === metricType);
}

function formatDistance(metric: WorkoutResultMetric | undefined) {
  if (metric?.numericValue == null || metric.numericValue <= 0) return null;
  const value = formatNumber(metric.numericValue);
  return metric.unit ? `${value} ${metric.unit}` : value;
}

function formatDuration(metric: WorkoutResultMetric | undefined) {
  if (metric?.numericValue == null || metric.numericValue <= 0) return null;
  const totalSeconds = Math.round(metric.numericValue);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRounds(metric: WorkoutResultMetric | undefined) {
  if (metric?.numericValue == null || metric.numericValue <= 0) return null;
  const rounds = formatNumber(metric.numericValue);
  return `${rounds} ${metric.numericValue === 1 ? "round" : "rounds"}`;
}

function formatScore(metric: WorkoutResultMetric | undefined) {
  const score = metric?.textValue?.trim();
  return score ? truncateSummary(score) : null;
}

function formatMovementSummary(movements: WorkoutResultMovement[]) {
  if (!movements.length) return null;

  if (movements.length === 1) {
    const movement = movements[0];
    if (!movement) return null;
    const movementName = movement.movementName.trim();
    if (!movementName) return null;

    const identicalSet = getIdenticalSet(movement.sets);
    if (identicalSet) {
      return truncateSummary(
        `${movementName} · ${formatNumber(identicalSet.load)} ${identicalSet.loadUnit} × ${identicalSet.reps} × ${movement.sets.length}`,
      );
    }

    if (movement.sets.length > 0) {
      return truncateSummary(
        `${movementName} · ${movement.sets.length} ${movement.sets.length === 1 ? "set" : "sets"}`,
      );
    }

    return truncateSummary(movementName);
  }

  const movementNames = movements
    .slice(0, 2)
    .map((movement) => movement.movementName.trim())
    .filter(Boolean);
  if (!movementNames.length) return null;

  const remainingCount = movements.length - movementNames.length;
  return truncateSummary(
    [...movementNames, remainingCount > 0 ? `+${remainingCount} more` : null]
      .filter(Boolean)
      .join(" · "),
  );
}

function getIdenticalSet(sets: WorkoutResultSet[]) {
  if (sets.length < 2) return null;
  const first = sets[0];
  if (
    !first ||
    first.reps == null ||
    first.load == null ||
    !first.loadUnit
  ) {
    return null;
  }

  return sets.every(
    (set) =>
      set.reps === first.reps &&
      set.load === first.load &&
      set.loadUnit === first.loadUnit,
  )
    ? { reps: first.reps, load: first.load, loadUnit: first.loadUnit }
    : null;
}

function joinSummaryParts(parts: Array<string | null>) {
  const availableParts = parts.filter((part): part is string => Boolean(part));
  return availableParts.length ? availableParts.join(" · ") : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

function truncateSummary(value: string, maxLength = 96) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
