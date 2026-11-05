import {
  formatGroupedIntervalSegment,
  groupConsecutiveIntervalSegments,
  type IntervalPresentationSegment,
  type RunWorkoutSubtype,
  type WorkoutFormat,
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
  workoutFormat?: WorkoutFormat | null;
  formatDurationSeconds?: number | null;
  formatIntervalSeconds?: number | null;
  formatRounds?: number | null;
  timeCapSeconds?: number | null;
  scoreFinished?: boolean | null;
  scoreTimeSeconds?: number | null;
  scoreRounds?: number | null;
  scoreReps?: number | null;
  metrics: WorkoutResultMetric[];
  movements: WorkoutResultMovement[];
  segments?: IntervalPresentationSegment[];
}) {
  if (input.workoutFormat) {
    return formatFormatSummary(input);
  }

  switch (input.workoutType) {
    case "run": {
      if (input.workoutSubtype === "interval" && input.segments?.length) {
        const groups = groupConsecutiveIntervalSegments(input.segments);
        const first = groups[0];
        if (first) {
          const summary = formatGroupedIntervalSegment(first).main;
          return truncateSummary(groups.length > 1 ? `${summary} · +${groups.length - 1} more` : summary);
        }
      }
      return joinSummaryParts([
        formatDistance(findMetric(input.metrics, "distance")),
        formatDuration(findMetric(input.metrics, "duration")),
      ]);
    }
    case "walk":
    case "cycling":
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

function formatFormatSummary(input: {
  workoutFormat?: WorkoutFormat | null;
  formatDurationSeconds?: number | null;
  formatIntervalSeconds?: number | null;
  formatRounds?: number | null;
  timeCapSeconds?: number | null;
  scoreFinished?: boolean | null;
  scoreTimeSeconds?: number | null;
  scoreRounds?: number | null;
  scoreReps?: number | null;
  movements: WorkoutResultMovement[];
}) {
  switch (input.workoutFormat) {
    case "amrap":
      return truncateSummary(joinSummaryParts([
        formatAmrapLabel(input.formatDurationSeconds),
        formatAmrapScore(input.scoreRounds, input.scoreReps),
      ]) ?? "AMRAP");
    case "for_time":
      return truncateSummary(joinSummaryParts([
        "For Time",
        formatForTimeScore(input),
      ]) ?? "For Time");
    case "emom":
      return truncateSummary(joinSummaryParts([
        formatEmomLabel(input.formatDurationSeconds, input.formatIntervalSeconds),
        formatEmomWork(input.movements),
      ]) ?? formatEmomLabel(input.formatDurationSeconds, input.formatIntervalSeconds));
    case "rounds":
      return truncateSummary(joinSummaryParts([
        formatRoundsCount(input.formatRounds),
        input.scoreTimeSeconds != null
          ? formatClock(input.scoreTimeSeconds)
          : formatRoundsMovements(input.movements),
      ]) ?? formatRoundsCount(input.formatRounds));
    default:
      return null;
  }
}

function formatAmrapLabel(durationSeconds: number | null | undefined) {
  const minutes = formatWholeMinutes(durationSeconds);
  return minutes ? `AMRAP ${minutes}` : "AMRAP";
}

function formatAmrapScore(rounds: number | null | undefined, reps: number | null | undefined) {
  if (rounds == null) return null;
  if (reps == null || reps === 0) {
    return `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"}`;
  }
  return `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"} + ${formatNumber(reps)} ${reps === 1 ? "rep" : "reps"}`;
}

function formatForTimeScore(input: {
  timeCapSeconds?: number | null;
  scoreFinished?: boolean | null;
  scoreTimeSeconds?: number | null;
  scoreReps?: number | null;
  movements: WorkoutResultMovement[];
}) {
  if (input.scoreFinished === true && input.scoreTimeSeconds != null) {
    return formatClock(input.scoreTimeSeconds);
  }
  if (input.scoreFinished === false && input.scoreReps != null) {
    const cap = input.timeCapSeconds != null ? ` (capped at ${formatClock(input.timeCapSeconds)})` : " (capped)";
    return `${formatNumber(input.scoreReps)} ${input.scoreReps === 1 ? "rep" : "reps"}${cap}`;
  }
  return formatMovementCount(input.movements);
}

function formatEmomLabel(
  durationSeconds: number | null | undefined,
  intervalSeconds: number | null | undefined,
) {
  const prefix = emomPrefix(intervalSeconds);
  const minutes = formatWholeMinutes(durationSeconds);
  return minutes ? `${prefix} ${minutes}` : prefix;
}

function emomPrefix(intervalSeconds: number | null | undefined) {
  if (intervalSeconds == null || intervalSeconds <= 0 || intervalSeconds === 60) return "EMOM";
  if (intervalSeconds % 60 === 0) return `E${intervalSeconds / 60}MOM`;
  return "EMOM";
}

function formatEmomWork(movements: WorkoutResultMovement[]) {
  if (movements.length === 1) {
    const movement = movements[0];
    const name = movement?.movementName.trim();
    const reps = movement?.sets[0]?.reps;
    if (name && reps != null) return `${formatNumber(reps)} ${name}`;
    return name || null;
  }
  return formatMovementCount(movements);
}

function formatRoundsCount(rounds: number | null | undefined) {
  if (rounds == null) return "Rounds";
  return `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"}`;
}

function formatRoundsMovements(movements: WorkoutResultMovement[]) {
  const names = movements
    .map((movement) => movement.movementName.trim())
    .filter(Boolean);
  if (!names.length) return formatMovementCount(movements);
  const shown = names.slice(0, 2);
  const remaining = names.length - shown.length;
  return [...shown, remaining > 0 ? `+${remaining} more` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatMovementCount(movements: WorkoutResultMovement[]) {
  if (!movements.length) return null;
  return `${movements.length} ${movements.length === 1 ? "movement" : "movements"}`;
}

function formatWholeMinutes(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return null;
  if (seconds % 60 === 0) return formatNumber(seconds / 60);
  return formatClock(seconds);
}

function formatClock(totalSeconds: number) {
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

  const namedMovements = movements.filter((movement) => movement.movementName.trim());
  if (!namedMovements.length) return null;

  // D-3: uniform sets → N×R, mixed → "N sets", then "+N more".
  const shown = namedMovements.slice(0, 2).map(formatMultiExercisePart);
  const remainingCount = namedMovements.length - shown.length;
  return truncateSummary(
    [...shown, remainingCount > 0 ? `+${remainingCount} more` : null]
      .filter(Boolean)
      .join(" · "),
  );
}

function formatMultiExercisePart(movement: WorkoutResultMovement) {
  const movementName = movement.movementName.trim();
  const uniformReps = getUniformReps(movement.sets);
  if (uniformReps != null) {
    return `${movementName} ${movement.sets.length}×${uniformReps}`;
  }
  if (movement.sets.length > 0) {
    return `${movementName} ${movement.sets.length} ${movement.sets.length === 1 ? "set" : "sets"}`;
  }
  return movementName;
}

function getUniformReps(sets: WorkoutResultSet[]) {
  if (!sets.length) return null;
  const first = sets[0];
  if (first?.reps == null) return null;
  return sets.every((set) => set.reps === first.reps) ? first.reps : null;
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
