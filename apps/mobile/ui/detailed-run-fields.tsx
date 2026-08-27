import type {
  RunWorkoutSubtype,
  WorkoutDistanceUnit,
} from "@repin/types";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TextField } from "./components";
import {
  buildRunResultSummary,
  createEmptyInterval,
  getExpandedSegmentCount,
  type IntervalDraft,
  type IntervalValidationIssue,
} from "../lib/detailed-run-results";
import { type QuickLogResultsDraft, WorkoutTimeInput } from "./quick-log-results";
import { colors, fonts, radii, spacing, type } from "./theme";

const runSubtypeOptions: { label: string; value: RunWorkoutSubtype }[] = [
  { label: "Distance", value: "distance" },
  { label: "Tempo", value: "tempo" },
  { label: "Intervals", value: "interval" },
];

export function RunSubtypeSelector({
  onChange,
  value,
}: {
  onChange: (value: RunWorkoutSubtype) => void;
  value: RunWorkoutSubtype | null;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Run type</Text>
      <View style={styles.subtypeToggle}>
        {runSubtypeOptions.map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.subtypeOption, value === option.value && styles.subtypeOptionSelected]}
          >
            <Text style={[styles.subtypeText, value === option.value && styles.subtypeTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function RunResultEditor({
  expanded,
  intervals,
  onDone,
  onEdit,
  onIntervalsChange,
  onResultsChange,
  results,
  subtype,
  validationError,
}: {
  expanded: boolean;
  intervals: IntervalDraft[];
  onDone: () => void;
  onEdit: () => void;
  onIntervalsChange: (intervals: IntervalDraft[]) => void;
  onResultsChange: (results: QuickLogResultsDraft) => void;
  results: QuickLogResultsDraft;
  subtype: RunWorkoutSubtype;
  validationError: IntervalValidationIssue | { message: string } | null;
}) {
  if (!expanded) {
    return (
      <View style={styles.collapsedSurface}>
        <View style={styles.collapsedCopy}>
          {buildRunResultSummary(subtype, results, intervals).map((summary, index) => (
            <Text key={`${summary}-${index}`} style={styles.summaryText}>{summary}</Text>
          ))}
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onEdit} style={styles.editAction}>
          <Text style={styles.editActionText}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  const updateResults = (change: Partial<QuickLogResultsDraft>) => onResultsChange({ ...results, ...change });

  return (
    <View style={styles.editorSection}>
      <View style={styles.editorSurface}>
        {subtype === "interval" ? (
          <IntervalEditor
            intervals={intervals}
            onChange={onIntervalsChange}
            validationError={validationError && "intervalIndex" in validationError ? validationError : null}
          />
        ) : (
          <>
            <Text style={styles.fieldLabelNoMargin}>Distance</Text>
            <View style={styles.metricRow}>
              <TextField compact containerStyle={styles.metricField} inputMode="decimal" onChangeText={(distance) => updateResults({ distance })} placeholder="3.2" value={results.distance} />
              <DistanceUnitToggle onChange={(distanceUnit) => updateResults({ distanceUnit })} value={results.distanceUnit} />
            </View>
            <Text style={styles.fieldLabelSpaced}>Time</Text>
            <WorkoutTimeInput
              minutes={results.timeMinutes}
              onMinutesChange={(timeMinutes) => updateResults({ timeMinutes })}
              onSecondsChange={(timeSeconds) => updateResults({ timeSeconds })}
              seconds={results.timeSeconds}
            />
            {validationError ? <Text accessibilityRole="alert" style={styles.inlineError}>{validationError.message}</Text> : null}
          </>
        )}
        <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.doneAction, pressed && styles.pressed]}>
          <Text style={styles.doneActionText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IntervalEditor({
  intervals,
  onChange,
  validationError,
}: {
  intervals: IntervalDraft[];
  onChange: (intervals: IntervalDraft[]) => void;
  validationError: IntervalValidationIssue | null;
}) {
  const updateInterval = (id: number, change: Partial<IntervalDraft>) => {
    onChange(intervals.map((interval) => interval.id === id ? { ...interval, ...change } : interval));
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Intervals</Text>
      {intervals.map((interval, index) => (
        <View key={interval.id} style={[styles.intervalScheme, index > 0 && styles.dividedScheme]}>
          <View style={styles.intervalHeader}>
            <Text style={styles.intervalTitle}>Interval {index + 1}</Text>
            {intervals.length > 1 ? (
              <Pressable accessibilityLabel={`Remove interval ${index + 1}`} accessibilityRole="button" hitSlop={8} onPress={() => onChange(intervals.filter((item) => item.id !== interval.id))}>
                <Text style={styles.removeAction}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <InlineError field="interval" index={index} issue={validationError} />

          <Text style={styles.fieldLabel}>Distance</Text>
          <View style={styles.metricRow}>
            <TextField compact containerStyle={styles.metricField} inputMode="decimal" onChangeText={(distance) => updateInterval(interval.id, { distance })} placeholder="400" value={interval.distance} />
            <UnitToggle onChange={(distanceUnit) => updateInterval(interval.id, { distanceUnit })} value={interval.distanceUnit} />
          </View>
          <InlineError field="distance" index={index} issue={validationError} />

          <Text style={styles.fieldLabelSpaced}>Time</Text>
          <WorkoutTimeInput
            minutes={interval.timeMinutes}
            onMinutesChange={(timeMinutes) => updateInterval(interval.id, { timeMinutes })}
            onSecondsChange={(timeSeconds) => updateInterval(interval.id, { timeSeconds })}
            seconds={interval.timeSeconds}
          />
          <InlineError field="time" index={index} issue={validationError} />

          <Text style={styles.fieldLabelSpaced}>Recovery</Text>
          <View style={styles.recoveryRow}>
            <TextField compact accessibilityLabel="Recovery seconds" containerStyle={styles.recoveryField} inputMode="numeric" keyboardType="number-pad" onChangeText={(recoverySeconds) => updateInterval(interval.id, { recoverySeconds })} placeholder="90" value={interval.recoverySeconds} />
            <Text style={styles.unitLabel}>sec</Text>
          </View>
          <InlineError field="recovery" index={index} issue={validationError} />

          <View style={styles.quantityRow}>
            <View>
              <Text style={styles.fieldLabelNoMargin}>Repeats</Text>
              <Text style={styles.quantityHelper}>Identical intervals</Text>
            </View>
            <View style={styles.quantityControl}>
              <Pressable
                accessibilityLabel={`Decrease interval ${index + 1} repeats`}
                accessibilityRole="button"
                accessibilityState={{ disabled: interval.quantity <= 1 }}
                disabled={interval.quantity <= 1}
                onPress={() => updateInterval(interval.id, { quantity: interval.quantity - 1 })}
                style={[styles.quantityButton, interval.quantity <= 1 && styles.quantityButtonDisabled]}
              >
                <Text style={styles.quantitySymbol}>−</Text>
              </Pressable>
              <Text accessibilityLabel={`${interval.quantity} repeats`} style={styles.quantityValue}>{interval.quantity}</Text>
              <Pressable
                accessibilityLabel={`Increase interval ${index + 1} repeats`}
                accessibilityRole="button"
                accessibilityState={{ disabled: interval.quantity >= 500 || getExpandedSegmentCount(intervals) >= 500 }}
                disabled={interval.quantity >= 500 || getExpandedSegmentCount(intervals) >= 500}
                onPress={() => updateInterval(interval.id, { quantity: interval.quantity + 1 })}
                style={[styles.quantityButton, (interval.quantity >= 500 || getExpandedSegmentCount(intervals) >= 500) && styles.quantityButtonDisabled]}
              >
                <Text style={styles.quantitySymbol}>+</Text>
              </Pressable>
            </View>
          </View>
          <InlineError field="quantity" index={index} issue={validationError} />
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onChange([...intervals, createEmptyInterval()])} style={({ pressed }) => [styles.addInterval, pressed && styles.pressed]}>
        <Text style={styles.addIntervalText}>+ Add interval</Text>
      </Pressable>
    </View>
  );
}

function InlineError({ field, index, issue }: {
  field: IntervalValidationIssue["field"];
  index: number;
  issue: IntervalValidationIssue | null;
}) {
  return issue?.intervalIndex === index && issue.field === field
    ? <Text accessibilityRole="alert" style={styles.inlineError}>{issue.message}</Text>
    : null;
}

function DistanceUnitToggle({ onChange, value }: { onChange: (value: "mi" | "km") => void; value: "mi" | "km" }) {
  return (
    <View style={styles.unitToggle}>
      {(["mi", "km"] as const).map((unit) => (
        <Pressable key={unit} onPress={() => onChange(unit)} style={[styles.unitOption, value === unit && styles.unitOptionSelected]}>
          <Text style={[styles.unitText, value === unit && styles.unitTextSelected]}>{unit}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function UnitToggle({ onChange, value }: { onChange: (value: WorkoutDistanceUnit) => void; value: WorkoutDistanceUnit }) {
  return (
    <View style={styles.unitToggle}>
      {(["m", "km", "mi"] as const).map((unit) => (
        <Pressable key={unit} onPress={() => onChange(unit)} style={[styles.unitOption, value === unit && styles.unitOptionSelected]}>
          <Text style={[styles.unitText, value === unit && styles.unitTextSelected]}>{unit}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  editorSection: { marginTop: spacing.xl },
  sectionTitle: { color: colors.ink, ...type.heading },
  subtypeToggle: { alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", marginTop: spacing.sm, padding: 3 },
  subtypeOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.md },
  subtypeOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  subtypeText: { color: colors.muted, ...type.label },
  subtypeTextSelected: { color: colors.ink },
  editorSurface: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md },
  intervalScheme: { marginTop: spacing.md },
  dividedScheme: { borderTopColor: colors.borderStrong, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.lg, paddingTop: spacing.lg },
  intervalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  intervalTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  removeAction: { color: colors.muted, ...type.label },
  fieldLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, marginTop: spacing.md },
  fieldLabelNoMargin: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  fieldLabelSpaced: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, marginTop: spacing.md },
  metricRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  metricField: { flex: 1, marginTop: 0 },
  unitToggle: { backgroundColor: colors.surface, borderRadius: radii.sm, flexDirection: "row", padding: 3 },
  unitOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 38, minWidth: 42, paddingHorizontal: spacing.sm },
  unitOptionSelected: { backgroundColor: colors.brandSoft },
  unitText: { color: colors.muted, ...type.label },
  unitTextSelected: { color: colors.brand },
  recoveryRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  recoveryField: { marginTop: 0, width: 96 },
  unitLabel: { color: colors.muted, ...type.bodySmall },
  inlineError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.xs },
  quantityRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  quantityHelper: { color: colors.muted, ...type.bodySmall, marginTop: 2 },
  quantityControl: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  quantityButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, height: 36, justifyContent: "center", width: 36 },
  quantityButtonDisabled: { opacity: 0.35 },
  quantitySymbol: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 20, lineHeight: 22 },
  quantityValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, minWidth: 24, textAlign: "center" },
  addInterval: { alignItems: "center", alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: spacing.md, paddingHorizontal: spacing.sm },
  addIntervalText: { color: colors.brand, ...type.label },
  doneAction: { alignItems: "center", alignSelf: "flex-end", justifyContent: "center", marginTop: spacing.md, minHeight: 40, paddingHorizontal: spacing.sm },
  doneActionText: { color: colors.brand, ...type.label },
  collapsedSurface: { alignItems: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginTop: spacing.xxl, padding: spacing.lg },
  collapsedCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  summaryText: { color: colors.ink, flexShrink: 1, ...type.bodyMedium },
  editAction: { alignItems: "center", flexShrink: 0, justifyContent: "center", minHeight: 32, paddingHorizontal: spacing.xs },
  editActionText: { color: colors.brand, ...type.label },
  pressed: { opacity: 0.72 },
});
