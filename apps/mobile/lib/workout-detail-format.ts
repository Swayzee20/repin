import type {
  WorkoutDetailMetric,
  WorkoutDetailMovement,
  WorkoutDetailSet,
  WorkoutFormatDetail,
} from "@repin/types";

export type DetailMetricRow = { label: string; value: string };

export type GroupedWorkoutSet = {
  endIndex: number;
  set: WorkoutDetailSet;
  startIndex: number;
};

export function formatWorkoutMetric(metric: WorkoutDetailMetric) {
  const label = metric.label?.trim() || metricLabels[metric.metricType] || "Result";

  if (metric.metricType === "duration" && metric.numericValue != null) {
    return { label, value: formatDurationSeconds(metric.numericValue) };
  }

  if (metric.metricType === "distance" && metric.numericValue != null) {
    return {
      label,
      value: joinValueAndUnit(metric.numericValue, metric.unit),
    };
  }

  if (metric.metricType === "rounds" && metric.numericValue != null) {
    return {
      label,
      value: formatNumber(metric.numericValue),
    };
  }

  if (metric.textValue?.trim()) {
    return { label, value: metric.textValue.trim() };
  }

  if (metric.numericValue != null) {
    return {
      label,
      value: joinValueAndUnit(metric.numericValue, metric.unit),
    };
  }

  return null;
}

export function buildDetailMetricRows(workout: {
  format?: WorkoutFormatDetail | null;
  metrics: WorkoutDetailMetric[];
  workoutType: string;
}): DetailMetricRow[] {
  if (workout.format) return formatFormatMetricRows(workout.format);

  const rows = workout.metrics
    .map(formatWorkoutMetric)
    .filter((row): row is DetailMetricRow => row !== null);

  if (workout.workoutType === "cycling") {
    const average = formatCyclingAverageSpeed(workout.metrics);
    if (average) rows.push({ label: "Avg speed", value: average });
  }

  return rows;
}

export function formatFormatMetricRows(format: WorkoutFormatDetail): DetailMetricRow[] {
  switch (format.type) {
    case "amrap": {
      const rows: DetailMetricRow[] = [{ label: "Format", value: "AMRAP" }];
      if (format.durationSeconds != null) {
        rows.push({ label: "Workout length", value: formatDurationSeconds(format.durationSeconds) });
      }
      if (format.score) {
        rows.push({ label: "Score", value: formatAmrapScore(format.score.rounds, format.score.reps) });
      }
      return rows;
    }
    case "for_time": {
      const rows: DetailMetricRow[] = [{ label: "Format", value: "For Time" }];
      if (format.rounds != null) {
        rows.push({ label: "Rounds", value: formatNumber(format.rounds) });
      }
      if (format.timeCapSeconds != null) {
        rows.push({ label: "Time cap", value: formatDurationSeconds(format.timeCapSeconds) });
      }
      if (format.score?.finished === true) {
        rows.push({ label: "Finish time", value: formatDurationSeconds(format.score.timeSeconds) });
      } else if (format.score?.finished === false) {
        rows.push({
          label: "Result",
          value: `${formatNumber(format.score.reps)} ${format.score.reps === 1 ? "rep" : "reps"} · capped`,
        });
      }
      return rows;
    }
    case "emom": {
      const rows: DetailMetricRow[] = [{ label: "Format", value: formatEmomName(format.intervalSeconds) }];
      if (format.intervalSeconds != null) {
        rows.push({ label: "Every", value: formatEveryLabel(format.intervalSeconds) });
      }
      if (format.durationSeconds != null) {
        rows.push({ label: "Workout length", value: formatDurationSeconds(format.durationSeconds) });
      }
      return rows;
    }
    case "rounds": {
      const rows: DetailMetricRow[] = [
        { label: "Format", value: "Rounds" },
        { label: "Rounds", value: formatNumber(format.rounds) },
      ];
      if (format.score?.timeSeconds != null) {
        rows.push({ label: "Total time", value: formatDurationSeconds(format.score.timeSeconds) });
      }
      return rows;
    }
  }
}

export function formatFfMovementsHeading(format: WorkoutFormatDetail) {
  switch (format.type) {
    case "amrap":
      return "Each round";
    case "for_time":
      return "Workout";
    case "emom":
      return "Each interval";
    case "rounds":
      return "Each round · same reps";
  }
}

export function formatEmomIntervalLabel(
  index: number,
  intervalSeconds: number | null | undefined,
) {
  const n = index + 1;
  if (intervalSeconds != null && intervalSeconds > 0 && intervalSeconds !== 60) {
    return `Interval ${n}`;
  }
  return `Min ${n}`;
}

export function formatFfMovementLine(movement: WorkoutDetailMovement) {
  const name = movement.movementName.trim();
  const set = movement.sets[0];
  const qty = formatFfQuantity(set);
  const load = set?.load != null ? joinValueAndUnit(set.load, set.loadUnit) : null;
  const work = qty && name ? `${qty} ${name}` : qty || name;
  if (load && work) return `${work} · ${load}`;
  return load || work || name;
}

export function groupIdenticalConsecutiveSets(sets: WorkoutDetailSet[]): GroupedWorkoutSet[] {
  return sets.reduce<GroupedWorkoutSet[]>((groups, set, index) => {
    const previous = groups.at(-1);
    if (previous && workoutSetsMatch(previous.set, set)) {
      previous.endIndex = index;
      return groups;
    }
    groups.push({ endIndex: index, set, startIndex: index });
    return groups;
  }, []);
}

export function formatSetGroupLabel(group: GroupedWorkoutSet) {
  const start = group.startIndex + 1;
  const end = group.endIndex + 1;
  return start === end ? `Set ${start}` : `Sets ${start}–${end}`;
}

export function formatWorkoutSet(set: WorkoutDetailSet) {
  const parts: string[] = [];

  if (set.load != null) {
    parts.push(joinValueAndUnit(set.load, set.loadUnit));
  }
  if (set.reps != null) {
    parts.push(set.load == null ? `${set.reps} reps` : `× ${set.reps}`);
  }
  if (set.durationSeconds != null) {
    parts.push(formatDurationSeconds(set.durationSeconds));
  }
  if (set.distance != null) {
    parts.push(joinValueAndUnit(set.distance, set.distanceUnit));
  }
  if (set.calories != null) {
    parts.push(`${set.calories} cal`);
  }

  if (parts.length) return parts.join(" ");
  return set.completed ? "Completed" : "Not completed";
}

export function formatDurationSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatCyclingAverageSpeed(metrics: WorkoutDetailMetric[]) {
  const distance = metrics.find((metric) => metric.metricType === "distance");
  const duration = metrics.find((metric) => metric.metricType === "duration");
  if (
    distance?.numericValue == null
    || !(distance.numericValue > 0)
    || duration?.numericValue == null
    || !(duration.numericValue > 0)
    || distance.unit === "m"
  ) {
    return null;
  }

  const hours = duration.numericValue / 3_600;
  const speed = distance.numericValue / hours;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    useGrouping: false,
  }).format(speed);
  const unit = distance.unit === "km" ? "km/h" : "mph";
  return `${formatted} ${unit}`;
}

function formatEmomName(intervalSeconds: number | null | undefined) {
  if (intervalSeconds == null || intervalSeconds <= 0 || intervalSeconds === 60) return "EMOM";
  if (intervalSeconds % 60 === 0) return `E${intervalSeconds / 60}MOM`;
  return "EMOM";
}

function formatEveryLabel(intervalSeconds: number) {
  if (intervalSeconds % 60 === 0) {
    return `${intervalSeconds / 60} min`;
  }
  return `${intervalSeconds}s`;
}

function formatAmrapScore(rounds: number, reps: number) {
  if (reps === 0) {
    return `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"}`;
  }
  return `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"} + ${formatNumber(reps)} ${reps === 1 ? "rep" : "reps"}`;
}

function formatFfQuantity(set: WorkoutDetailSet | undefined) {
  if (!set) return null;
  if (set.reps != null) return formatNumber(set.reps);
  if (set.calories != null) return `${formatNumber(set.calories)} cal`;
  if (set.distance != null) return joinValueAndUnit(set.distance, set.distanceUnit);
  if (set.durationSeconds != null) return `${formatNumber(set.durationSeconds)} sec`;
  return null;
}

function workoutSetsMatch(left: WorkoutDetailSet, right: WorkoutDetailSet) {
  return left.reps === right.reps
    && left.load === right.load
    && left.loadUnit === right.loadUnit
    && left.durationSeconds === right.durationSeconds
    && left.distance === right.distance
    && left.distanceUnit === right.distanceUnit
    && left.calories === right.calories;
}

function joinValueAndUnit(value: number, unit: string | null) {
  return [formatNumber(value), unit?.trim()].filter(Boolean).join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

const metricLabels: Record<string, string> = {
  duration: "Time",
  distance: "Distance",
  calories: "Calories",
  rounds: "Rounds",
  score: "Score",
  pace: "Pace",
  other: "Result",
};
