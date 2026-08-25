import type { WorkoutDetailMetric, WorkoutDetailSet } from "@repin/types";

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
      value: `${formatNumber(metric.numericValue)} ${metric.numericValue === 1 ? "round" : "rounds"}`,
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
