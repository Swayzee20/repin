import type { WorkoutDistanceUnit, WorkoutType } from "@repin/types";
import { useRef, type ComponentRef, type Ref } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextInput, type ViewStyle } from "react-native";

import { TextField } from "./components";
import { FieldLabel, NumberField, secondsRangeError } from "./form-fields";
import { formSpacing, helperText } from "./form-field-state";
import { fieldChainProps } from "./keyboard";
import {
  averageSpeedHelper,
  buildQuickLogResults,
  distancePlaceholder,
  distanceUnitOptions,
  emptyQuickLogResults,
  hiitExerciseHelper,
  hoursRangeError,
  hydrateQuickLogResults,
  isDistanceWorkout,
  joinDurationMinutes,
  splitDurationMinutes,
  usesHoursTime,
  validateQuickLogResults,
  type QuickLogResultsDraft,
} from "./logging-form-state";
import { SegmentedControl } from "./primitives";
import { size, spacing } from "./theme";

export {
  buildQuickLogResults,
  emptyQuickLogResults,
  hydrateQuickLogResults,
  validateQuickLogResults,
};
export type { QuickLogResultsDraft };

type FunctionalResultType = "time" | "rounds" | "score";

export function WorkoutMetricFields({
  onChange,
  value,
  workoutType,
}: {
  onChange: (value: QuickLogResultsDraft) => void;
  value: QuickLogResultsDraft;
  workoutType: WorkoutType | null;
}) {
  const isDistance = isDistanceWorkout(workoutType);
  const showHours = usesHoursTime(workoutType);
  const showTime = isDistance
    || workoutType === "hiit"
    || workoutType === "other"
    || (workoutType === "functional_fitness" && value.functionalResultType === "time");
  const timeRef = useRef<ComponentRef<typeof TextInput>>(null);
  const update = (change: Partial<QuickLogResultsDraft>) => onChange({ ...value, ...change });
  const advanceToTime = fieldChainProps({
    count: showTime ? 2 : 1,
    index: 0,
    onAdvance: () => timeRef.current?.focus(),
  });
  const unitOptions = distanceUnitOptions(workoutType, value.distanceUnit);
  const averageSpeed = workoutType === "cycling" ? averageSpeedHelper(value) : null;

  return (
    <>
      {isDistance ? (
        <View style={styles.section}>
          <FieldLabel label="Distance" optional />
          <View style={styles.metricRow}>
            <NumberField
              accessibilityLabel="Distance"
              containerStyle={styles.metricField}
              kind="decimal"
              onChangeText={(distance) => update({ distance })}
              placeholder={distancePlaceholder(workoutType, value.distanceUnit)}
              suffix={value.distanceUnit}
              value={value.distance}
              {...advanceToTime}
            />
            <SegmentedControl<WorkoutDistanceUnit>
              accessibilityLabel="Distance unit"
              onChange={(distanceUnit) => {
                if (distanceUnit) update({ distanceUnit });
              }}
              options={unitOptions}
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
            <NumberField accessibilityLabel="Rounds" containerStyle={styles.resultField} kind="number" onChangeText={(rounds) => update({ rounds })} placeholder="5" value={value.rounds} {...advanceToTime} />
          ) : null}
          {value.functionalResultType === "score" ? (
            <TextField accessibilityLabel="Score" containerStyle={styles.resultField} maxLength={500} onChangeText={(score) => update({ score })} placeholder="5 rounds + 12 reps" value={value.score} {...advanceToTime} />
          ) : null}
        </View>
      ) : null}

      {showTime ? (
        <View style={styles.section}>
          <FieldLabel label="Time" optional />
          <WorkoutTimeInput
            inputRef={timeRef}
            minutes={value.timeMinutes}
            onMinutesChange={(timeMinutes) => update({ timeMinutes })}
            onSecondsChange={(timeSeconds) => update({ timeSeconds })}
            seconds={value.timeSeconds}
            showHours={showHours}
          />
          {averageSpeed ? <Text style={styles.helper}>{averageSpeed}</Text> : null}
          {workoutType === "hiit" ? <Text style={styles.helper}>{hiitExerciseHelper}</Text> : null}
        </View>
      ) : null}
    </>
  );
}

export function WorkoutTimeInput({
  containerStyle,
  inputRef,
  invalid = false,
  minutes,
  onMinutesChange,
  onSecondsChange,
  onSubmit,
  seconds,
  showHours = false,
}: {
  containerStyle?: StyleProp<ViewStyle>;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  invalid?: boolean;
  minutes: string;
  onMinutesChange: (value: string) => void;
  onSecondsChange: (value: string) => void;
  /** Return on seconds. Omit to dismiss the keyboard. */
  onSubmit?: () => void;
  seconds: string;
  showHours?: boolean;
}) {
  const minutesRef = useRef<ComponentRef<typeof TextInput>>(null);
  const secondsRef = useRef<ComponentRef<typeof TextInput>>(null);
  const parts = showHours ? splitDurationMinutes(minutes) : { hours: "", minutes };
  const fieldCount = showHours ? 3 : 2;
  const hoursError = showHours ? hoursRangeError(parts.hours) : null;
  const minutesError = showHours ? secondsRangeError(parts.minutes) : null;

  return (
    <View style={[styles.timeRow, containerStyle]}>
      {showHours ? (
        <NumberField
          accessibilityLabel="Hours"
          containerStyle={styles.timeField}
          error={hoursError}
          kind="number"
          onChangeText={(hours) => {
            if (hours && !/^\d*$/.test(hours)) return;
            onMinutesChange(joinDurationMinutes(hours, parts.minutes));
          }}
          placeholder="1"
          ref={inputRef}
          suffix="h"
          value={parts.hours}
          {...fieldChainProps({
            count: fieldCount,
            index: 0,
            onAdvance: () => minutesRef.current?.focus(),
          })}
        />
      ) : null}
      <NumberField
        accessibilityLabel="Minutes"
        containerStyle={styles.timeField}
        error={minutesError}
        invalid={invalid}
        kind="number"
        onChangeText={(nextMinutes) => {
          if (showHours) {
            if (nextMinutes && secondsRangeError(nextMinutes)) {
              if (!/^\d*$/.test(nextMinutes)) return;
              if (Number(nextMinutes) > 59) return;
            }
            onMinutesChange(joinDurationMinutes(parts.hours, nextMinutes));
            return;
          }
          onMinutesChange(nextMinutes);
        }}
        placeholder="28"
        ref={showHours ? minutesRef : inputRef}
        suffix="min"
        value={parts.minutes}
        {...fieldChainProps({
          count: fieldCount,
          index: showHours ? 1 : 0,
          onAdvance: () => secondsRef.current?.focus(),
        })}
      />
      <NumberField
        accessibilityLabel="Seconds"
        containerStyle={styles.timeField}
        error={secondsRangeError(seconds)}
        invalid={invalid}
        kind="number"
        onChangeText={onSecondsChange}
        placeholder="14"
        ref={secondsRef}
        suffix="sec"
        value={seconds}
        {...fieldChainProps({
          count: onSubmit || showHours ? fieldCount : 1,
          index: showHours ? 2 : 0,
          onAdvance: () => onSubmit?.(),
          onFinish: onSubmit,
        })}
      />
    </View>
  );
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
  helper: { ...helperText, marginTop: formSpacing.helperGap },
});
