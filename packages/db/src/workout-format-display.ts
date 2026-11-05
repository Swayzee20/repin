import type {
  WorkoutDetailMetric,
  WorkoutFormatDetail,
} from "@repin/types";

export function deriveLogVersion(input: {
  workoutType: string;
  workoutFormat: string | null;
  metrics: Array<{ metricType: string; unit: string | null }>;
  movements: Array<{ sets: Array<{ distanceUnit: string | null }> }>;
}): 1 | 2 {
  if (input.workoutFormat) return 2;
  if (input.workoutType === "cycling") return 2;
  if (input.metrics.some((metric) => metric.metricType === "distance" && metric.unit === "m")) {
    return 2;
  }
  if (input.movements.some((movement) =>
    movement.sets.some((set) => set.distanceUnit === "m"))) {
    return 2;
  }
  return 1;
}

export function derivedDisplayMetrics(
  format: WorkoutFormatDetail,
  sessionId: string,
): WorkoutDetailMetric[] {
  const metrics: WorkoutDetailMetric[] = [];

  const push = (
    metricType: WorkoutDetailMetric["metricType"],
    label: string,
    values: { numericValue?: number | null; textValue?: string | null; unit?: string | null } = {},
  ) => {
    metrics.push({
      id: `${sessionId}:derived:${metrics.length}`,
      position: metrics.length,
      metricType,
      label,
      numericValue: values.numericValue ?? null,
      textValue: values.textValue ?? null,
      unit: values.unit ?? null,
    });
  };

  switch (format.type) {
    case "amrap":
      push("other", "Format", { textValue: "AMRAP" });
      if (format.durationSeconds != null) {
        push("duration", "Workout length", {
          numericValue: format.durationSeconds,
          unit: "seconds",
        });
      }
      if (format.score) {
        push("score", "Score", { textValue: formatAmrapScore(format.score.rounds, format.score.reps) });
      }
      break;
    case "for_time":
      push("other", "Format", { textValue: "For Time" });
      if (format.rounds != null) {
        push("rounds", "Rounds", { numericValue: format.rounds });
      }
      if (format.timeCapSeconds != null) {
        push("duration", "Time cap", {
          numericValue: format.timeCapSeconds,
          unit: "seconds",
        });
      }
      if (format.score?.finished === true) {
        push("duration", "Finish time", {
          numericValue: format.score.timeSeconds,
          unit: "seconds",
        });
      } else if (format.score?.finished === false) {
        push("score", "Result", { textValue: `${format.score.reps} reps · capped` });
      }
      break;
    case "emom":
      push("other", "Format", { textValue: formatEmomLabel(format.intervalSeconds) });
      if (format.intervalSeconds != null) {
        push("other", "Every", { textValue: formatEveryLabel(format.intervalSeconds) });
      }
      if (format.durationSeconds != null) {
        push("duration", "Workout length", {
          numericValue: format.durationSeconds,
          unit: "seconds",
        });
      }
      break;
    case "rounds":
      push("other", "Format", { textValue: "Rounds" });
      push("rounds", "Rounds", { numericValue: format.rounds });
      if (format.score?.timeSeconds != null) {
        push("duration", "Total time", {
          numericValue: format.score.timeSeconds,
          unit: "seconds",
        });
      }
      break;
  }

  return metrics;
}

function formatAmrapScore(rounds: number, reps: number) {
  if (reps === 0) {
    return `${rounds} ${rounds === 1 ? "round" : "rounds"}`;
  }
  return `${rounds} ${rounds === 1 ? "round" : "rounds"} + ${reps} ${reps === 1 ? "rep" : "reps"}`;
}

function formatEmomLabel(intervalSeconds: number | null) {
  if (intervalSeconds == null || intervalSeconds <= 0 || intervalSeconds === 60) return "EMOM";
  if (intervalSeconds % 60 === 0) return `E${intervalSeconds / 60}MOM`;
  return "EMOM";
}

function formatEveryLabel(intervalSeconds: number) {
  if (intervalSeconds % 60 === 0) {
    const minutes = intervalSeconds / 60;
    return `${minutes} ${minutes === 1 ? "min" : "min"}`;
  }
  return `${intervalSeconds}s`;
}
