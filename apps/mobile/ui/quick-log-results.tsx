import type { QuickLogMetricInput, WorkoutDetailMetric, WorkoutType } from "@repin/types";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { TextField } from "./components";
import { FieldLabel, NumberField, secondsRangeError } from "./form-fields";
import { SegmentedControl } from "./primitives";
import { getDurationSeconds, validateTimeParts } from "../lib/workout-time";
import { size, spacing } from "./theme";

type DistanceUnit = "mi" | "km";
type FunctionalResultType = "time" | "rounds" | "score";

export interface QuickLogResultsDraft {
  distance: string;
  distanceUnit: DistanceUnit;
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

export function hydrateQuickLogResults(metrics: WorkoutDetailMetric[]): QuickLogResultsDraft {
  const distance = metrics.find((metric) => metric.metricType === "distance");
  const duration = metrics.find((metric) => metric.metricType === "duration");
  const rounds = metrics.find((metric) => metric.metricType === "rounds");
  const score = metrics.find((metric) => metric.metricType === "score");
  const durationSeconds = duration?.numericValue == null ? null : Math.round(duration.numericValue);
  return {
    distance: distance?.numericValue == null ? "" : String(distance.numericValue),
    distanceUnit: distance?.unit === "km" ? "km" : "mi",
    timeMinutes: durationSeconds == null ? "" : String(Math.floor(durationSeconds / 60)),
    timeSeconds: durationSeconds == null ? "" : String(durationSeconds % 60),
    functionalResultType: duration ? "time" : rounds ? "rounds" : score ? "score" : null,
    rounds: rounds?.numericValue == null ? "" : String(rounds.numericValue),
    score: score?.textValue ?? "",
  };
}

export function WorkoutMetricFields({
  onChange,
  value,
  workoutType,
}: {
  onChange: (value: QuickLogResultsDraft) => void;
  value: QuickLogResultsDraft;
  workoutType: WorkoutType | null;
}) {
  const isDistance = workoutType === "run" || workoutType === "walk";
  const showTime = isDistance
    || workoutType === "hiit"
    || workoutType === "other"
    || (workoutType === "functional_fitness" && value.functionalResultType === "time");
  const update = (change: Partial<QuickLogResultsDraft>) => onChange({ ...value, ...change });

  return (
    <>
      {isDistance ? (
        <View style={styles.section}>
          <FieldLabel label="Distance" optional />
          <View style={styles.metricRow}>
            <NumberField accessibilityLabel="Distance" containerStyle={styles.metricField} kind="decimal" onChangeText={(distance) => update({ distance })} placeholder="3.2" suffix={value.distanceUnit} value={value.distance} />
            <SegmentedControl<DistanceUnit>
              accessibilityLabel="Distance unit"
              onChange={(distanceUnit) => {
                if (distanceUnit) update({ distanceUnit });
              }}
              options={[{ label: "Mi", value: "mi" }, { label: "Km", value: "km" }]}
              size="sm"
              style={styles.inlineSegment}
              value={value.distanceUnit}
            />
          </View>
        </View>
      ) : null}

      {workoutType === "functional_fitness" ? (
        <View style={styles.section}>
          <FieldLabel label="Result" optional />
          <SegmentedControl<FunctionalResultType>
            accessibilityLabel="Result"
            allowClear
            onChange={(functionalResultType) => update({ functionalResultType })}
            options={[{ label: "Time", value: "time" }, { label: "Rounds", value: "rounds" }, { label: "Score", value: "score" }]}
            size="sm"
            style={styles.segment}
            value={value.functionalResultType}
          />
          {value.functionalResultType === "rounds" ? (
            <NumberField accessibilityLabel="Rounds" containerStyle={styles.resultField} kind="number" onChangeText={(rounds) => update({ rounds })} placeholder="5" value={value.rounds} />
          ) : null}
          {value.functionalResultType === "score" ? (
            <TextField accessibilityLabel="Score" containerStyle={styles.resultField} maxLength={500} onChangeText={(score) => update({ score })} placeholder="5 rounds + 12 reps" value={value.score} />
          ) : null}
        </View>
      ) : null}

      {showTime ? (
        <View style={styles.section}>
          <FieldLabel label="Time" optional />
          <WorkoutTimeInput
            minutes={value.timeMinutes}
            onMinutesChange={(timeMinutes) => update({ timeMinutes })}
            onSecondsChange={(timeSeconds) => update({ timeSeconds })}
            seconds={value.timeSeconds}
          />
        </View>
      ) : null}
    </>
  );
}

export function WorkoutTimeInput({
  containerStyle,
  minutes,
  onMinutesChange,
  onSecondsChange,
  seconds,
}: {
  containerStyle?: StyleProp<ViewStyle>;
  minutes: string;
  onMinutesChange: (value: string) => void;
  onSecondsChange: (value: string) => void;
  seconds: string;
}) {
  return (
    <View style={[styles.timeRow, containerStyle]}>
      <NumberField accessibilityLabel="Minutes" containerStyle={styles.timeField} kind="number" onChangeText={onMinutesChange} placeholder="28" suffix="min" value={minutes} />
      <NumberField accessibilityLabel="Seconds" containerStyle={styles.timeField} error={secondsRangeError(seconds)} kind="number" onChangeText={onSecondsChange} placeholder="14" suffix="sec" value={seconds} />
    </View>
  );
}

export function validateQuickLogResults(value: QuickLogResultsDraft, workoutType: WorkoutType) {
  if ((workoutType === "run" || workoutType === "walk") && value.distance.trim()) {
    const distance = Number(value.distance);
    if (!Number.isFinite(distance) || distance <= 0) return "Distance must be greater than zero.";
  }
  const usesTime = workoutType === "run"
    || workoutType === "walk"
    || workoutType === "hiit"
    || workoutType === "other"
    || (workoutType === "functional_fitness" && value.functionalResultType === "time");
  if (usesTime) {
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
  if ((workoutType === "run" || workoutType === "walk") && value.distance.trim()) {
    metrics.push({ metricType: "distance", numericValue: Number(value.distance), unit: value.distanceUnit });
  }
  const usesTime = workoutType === "run"
    || workoutType === "walk"
    || workoutType === "hiit"
    || workoutType === "other"
    || (workoutType === "functional_fitness" && value.functionalResultType === "time");
  const durationSeconds = usesTime ? getDurationSeconds(value.timeMinutes, value.timeSeconds) : null;
  if (durationSeconds != null) metrics.push({ metricType: "duration", numericValue: durationSeconds, unit: "seconds" });
  if (workoutType === "functional_fitness" && value.functionalResultType === "rounds" && value.rounds.trim()) {
    metrics.push({ metricType: "rounds", numericValue: Number(value.rounds), unit: "rounds" });
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "score" && value.score.trim()) {
    metrics.push({ metricType: "score", textValue: value.score.trim() });
  }

  return { metrics, durationSeconds };
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  metricRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  metricField: { flexGrow: 1, flexShrink: 1, minWidth: size.control },
  resultField: { marginTop: spacing.sm },
  timeRow: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, width: "100%" },
  timeField: { flexGrow: 1, flexShrink: 1, minWidth: size.control },
  segment: { marginTop: spacing.sm },
  inlineSegment: { alignSelf: "center" },
});
