import type { QuickLogMetricInput, WorkoutDetailMetric, WorkoutType } from "@repin/types";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { TextField } from "./components";
import { getDurationSeconds, validateTimeParts } from "../lib/workout-time";
import { colors, compactControlShadowStyle, fonts, radii, spacing, type } from "./theme";

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
          <FieldLabel label="Distance" />
          <View style={styles.metricRow}>
            <TextField compact containerStyle={styles.metricField} inputMode="decimal" onChangeText={(distance) => update({ distance })} placeholder="3.2" value={value.distance} />
            <ChoiceToggle<DistanceUnit> onChange={(distanceUnit) => distanceUnit && update({ distanceUnit })} options={["mi", "km"]} value={value.distanceUnit} />
          </View>
        </View>
      ) : null}

      {workoutType === "functional_fitness" ? (
        <View style={styles.section}>
          <FieldLabel label="Result" />
          <ChoiceToggle<FunctionalResultType>
            allowClear
            onChange={(functionalResultType) => update({ functionalResultType })}
            options={["time", "rounds", "score"]}
            value={value.functionalResultType}
          />
          {value.functionalResultType === "rounds" ? (
            <TextField compact containerStyle={styles.resultField} inputMode="numeric" onChangeText={(rounds) => update({ rounds })} placeholder="5" value={value.rounds} />
          ) : null}
          {value.functionalResultType === "score" ? (
            <TextField compact containerStyle={styles.resultField} maxLength={500} onChangeText={(score) => update({ score })} placeholder="5 rounds + 12 reps" value={value.score} />
          ) : null}
        </View>
      ) : null}

      {showTime ? (
        <View style={styles.section}>
          <FieldLabel label="Time" />
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

function ChoiceToggle<T extends string>({
  allowClear = false,
  onChange,
  options,
  value,
}: {
  allowClear?: boolean;
  onChange: (value: T | null) => void;
  options: readonly T[];
  value: T | null;
}) {
  return (
    <View style={styles.toggle}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          key={option}
          onPress={() => {
            if (allowClear && value === option) {
              onChange(null);
            } else {
              onChange(option);
            }
          }}
          style={[styles.toggleOption, value === option && styles.toggleOptionSelected]}
        >
          <Text style={[styles.toggleText, value === option && styles.toggleTextSelected]}>{capitalize(option)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <View style={styles.labelRow}><Text style={styles.sectionTitle}>{label}</Text><Text style={styles.optional}>Optional</Text></View>;
}

export function WorkoutTimeInput({
  containerStyle,
  elevated = false,
  fieldStyle,
  focusedInputStyle,
  inputStyle,
  minutes,
  onMinutesChange,
  onSecondsChange,
  seconds,
}: {
  containerStyle?: StyleProp<ViewStyle>;
  elevated?: boolean;
  fieldStyle?: StyleProp<ViewStyle>;
  focusedInputStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  minutes: string;
  onMinutesChange: (value: string) => void;
  onSecondsChange: (value: string) => void;
  seconds: string;
}) {
  return (
    <View style={[styles.timeRow, containerStyle]}>
      <View style={styles.timePart}>
        <TextField compact accessibilityLabel="Minutes" containerStyle={[styles.timeField, fieldStyle]} focusedStyle={focusedInputStyle} inputMode="numeric" keyboardType="number-pad" onChangeText={onMinutesChange} placeholder="28" style={[elevated && styles.elevatedInput, inputStyle]} value={minutes} />
        <Text style={styles.timeUnit}>min</Text>
      </View>
      <View style={styles.timePart}>
        <TextField compact accessibilityLabel="Seconds" containerStyle={[styles.timeField, fieldStyle]} focusedStyle={focusedInputStyle} inputMode="numeric" keyboardType="number-pad" maxLength={2} onChangeText={onSecondsChange} placeholder="14" style={[elevated && styles.elevatedInput, inputStyle]} value={seconds} />
        <Text style={styles.timeUnit}>sec</Text>
      </View>
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

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  sectionTitle: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.xs },
  optional: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  metricRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  metricField: { flex: 1, marginTop: 0 },
  resultField: { marginTop: spacing.sm },
  timeRow: { alignItems: "center", flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  timePart: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  timeField: { width: 84 },
  elevatedInput: { ...compactControlShadowStyle },
  timeUnit: { color: colors.muted, ...type.bodySmall },
  toggle: { alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", marginTop: spacing.sm, padding: 3 },
  toggleOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 36, minWidth: 48, paddingHorizontal: spacing.md },
  toggleOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  toggleText: { color: colors.muted, ...type.label },
  toggleTextSelected: { color: colors.ink },
});
