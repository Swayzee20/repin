import type {
  RunWorkoutSubtype,
  WorkoutDistanceUnit,
} from "@repin/types";
import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TextField } from "./components";
import {
  buildRunResultSummary,
  createEmptyInterval,
  getExpandedSegmentCount,
  getIntervalValidationIssue,
  type IntervalDraft,
  type IntervalValidationIssue,
} from "../lib/detailed-run-results";
import { type QuickLogResultsDraft, WorkoutTimeInput } from "./quick-log-results";
import { formatDurationSeconds } from "../lib/workout-detail-format";
import { getDurationSeconds } from "../lib/workout-time";
import { colors, compactControlShadowStyle, compactSelectorShadowStyle, fonts, radii, spacing, type } from "./theme";

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
    const summaries = buildRunResultSummary(subtype, results, intervals);

    return (
      <Pressable
        accessibilityLabel={subtype === "interval" ? "Edit interval workout" : subtype === "tempo" ? "Edit tempo run details" : "Edit distance run details"}
        accessibilityRole="button"
        onPress={onEdit}
        style={({ pressed }) => [styles.collapsedSurface, pressed && styles.pressed]}
      >
        <Feather color={colors.success} name="check-circle" size={16} />
        <View style={styles.collapsedCopy}>
          {summaries.map((summary, index) => (
            <Text key={`${summary}-${index}`} style={styles.summaryText}>{summary}</Text>
          ))}
        </View>
        <Feather color={colors.muted} name="chevron-right" size={18} />
      </Pressable>
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
            onDone={onDone}
            validationError={validationError && "intervalIndex" in validationError ? validationError : null}
          />
        ) : (
          <>
            <View style={[styles.intervalMetricRow, styles.metricRowSurface, styles.firstMetricRow]}>
              <Text style={styles.intervalMetricLabel}>Distance</Text>
              <View style={styles.intervalMetricControls}>
                <TextField compact containerStyle={styles.metricField} focusedStyle={styles.integratedInputFocused} inputMode="decimal" onChangeText={(distance) => updateResults({ distance })} placeholder="3.2" style={styles.integratedInput} value={results.distance} />
                <DistanceUnitToggle onChange={(distanceUnit) => updateResults({ distanceUnit })} value={results.distanceUnit} />
              </View>
            </View>
            <View style={[styles.intervalMetricRow, styles.metricRowSurface]}>
              <Text style={styles.intervalMetricLabel}>Time</Text>
              <WorkoutTimeInput
                containerStyle={styles.intervalTimeControls}
                fieldStyle={styles.intervalTimeField}
                focusedInputStyle={styles.integratedInputFocused}
                inputStyle={styles.integratedInput}
                minutes={results.timeMinutes}
                onMinutesChange={(timeMinutes) => updateResults({ timeMinutes })}
                onSecondsChange={(timeSeconds) => updateResults({ timeSeconds })}
                seconds={results.timeSeconds}
              />
            </View>
            {validationError ? <Text accessibilityRole="alert" style={styles.inlineError}>{validationError.message}</Text> : null}
          </>
        )}
        {subtype !== "interval" ? (
          <Pressable accessibilityRole="button" hitSlop={1} onPress={onDone} style={({ pressed }) => [styles.doneAction, pressed && styles.pressed]}>
            <Text style={styles.doneActionText}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function IntervalEditor({
  intervals,
  onChange,
  onDone,
  validationError,
}: {
  intervals: IntervalDraft[];
  onChange: (intervals: IntervalDraft[]) => void;
  onDone: () => void;
  validationError: IntervalValidationIssue | null;
}) {
  const [activeIntervalId, setActiveIntervalId] = useState<number | null>(() => intervals[0]?.id ?? null);

  useEffect(() => {
    if (!intervals.some((interval) => interval.id === activeIntervalId)) {
      setActiveIntervalId(intervals[0]?.id ?? null);
    }
  }, [activeIntervalId, intervals]);

  useEffect(() => {
    if (!validationError) return;
    const invalidInterval = intervals[validationError.intervalIndex];
    if (invalidInterval) setActiveIntervalId(invalidInterval.id);
  }, [intervals, validationError]);

  const updateInterval = (id: number, change: Partial<IntervalDraft>) => {
    onChange(intervals.map((interval) => interval.id === id ? { ...interval, ...change } : interval));
  };

  const addInterval = () => {
    const nextInterval = createEmptyInterval();
    onChange([...intervals, nextInterval]);
    setActiveIntervalId(nextInterval.id);
  };

  const removeInterval = (id: number) => {
    const removedIndex = intervals.findIndex((interval) => interval.id === id);
    const remainingIntervals = intervals.filter((interval) => interval.id !== id);
    if (activeIntervalId === id) {
      const nextActiveIndex = Math.max(0, Math.min(removedIndex - 1, remainingIntervals.length - 1));
      setActiveIntervalId(remainingIntervals[nextActiveIndex]?.id ?? null);
    }
    onChange(remainingIntervals);
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Intervals</Text>
      {intervals.map((interval, index) => {
        const expanded = activeIntervalId === interval.id;
        const completed = !expanded && getIntervalValidationIssue([interval]) === null;
        const collapsedStatus = completed ? buildIntervalEditorSummary(interval) : "Needs details";

        return (
        <View key={interval.id} style={styles.intervalScheme}>
          {index > 0 ? <View style={styles.intervalDivider} /> : null}
          <View style={[styles.intervalHeader, !expanded && styles.collapsedIntervalHeader]}>
            <Pressable
              accessibilityLabel={`Interval ${index + 1}, ${expanded ? "expanded" : "collapsed"}`}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setActiveIntervalId(interval.id)}
              style={({ pressed }) => [styles.intervalToggle, pressed && styles.pressed]}
            >
              {completed ? <Feather color={colors.success} name="check-circle" size={16} /> : null}
              <Text style={styles.intervalTitle}>Interval {index + 1}</Text>
              {!expanded ? (
                <Text numberOfLines={1} style={[styles.intervalSummary, !completed && styles.intervalNeedsDetails]}>
                  {collapsedStatus}
                </Text>
              ) : null}
              <Feather color={colors.muted} name={expanded ? "chevron-down" : "chevron-right"} size={18} />
            </Pressable>
            {index > 0 ? (
              <Pressable accessibilityLabel={`Remove interval ${index + 1}`} accessibilityRole="button" hitSlop={8} onPress={() => removeInterval(interval.id)} style={styles.removeButton}>
                <Text style={styles.removeAction}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <InlineError field="interval" index={index} issue={validationError} />

          {expanded ? <>
          <View style={[styles.intervalMetricRow, styles.metricRowSurface]}>
            <Text style={styles.intervalMetricLabel}>Distance</Text>
            <View style={styles.intervalMetricControls}>
              <TextField compact containerStyle={styles.metricField} focusedStyle={styles.integratedInputFocused} inputMode="decimal" onChangeText={(distance) => updateInterval(interval.id, { distance })} placeholder="400" style={styles.integratedInput} value={interval.distance} />
              <UnitToggle onChange={(distanceUnit) => updateInterval(interval.id, { distanceUnit })} value={interval.distanceUnit} />
            </View>
          </View>
          <InlineError field="distance" index={index} issue={validationError} />

          <View style={[styles.intervalMetricRow, styles.metricRowSurface]}>
            <Text style={styles.intervalMetricLabel}>Time</Text>
            <WorkoutTimeInput
              containerStyle={styles.intervalTimeControls}
              fieldStyle={styles.intervalTimeField}
              focusedInputStyle={styles.integratedInputFocused}
              inputStyle={styles.integratedInput}
              minutes={interval.timeMinutes}
              onMinutesChange={(timeMinutes) => updateInterval(interval.id, { timeMinutes })}
              onSecondsChange={(timeSeconds) => updateInterval(interval.id, { timeSeconds })}
              seconds={interval.timeSeconds}
            />
          </View>
          <InlineError field="time" index={index} issue={validationError} />

          <View style={[styles.intervalMetricRow, styles.metricRowSurface]}>
            <Text style={styles.intervalMetricLabel}>Recovery</Text>
            <View style={styles.recoveryRow}>
              <TextField compact accessibilityLabel="Recovery seconds" containerStyle={styles.recoveryField} focusedStyle={styles.integratedInputFocused} inputMode="numeric" keyboardType="number-pad" onChangeText={(recoverySeconds) => updateInterval(interval.id, { recoverySeconds })} placeholder="90" style={styles.integratedInput} value={interval.recoverySeconds} />
              <Text style={styles.unitLabel}>sec</Text>
            </View>
          </View>
          <InlineError field="recovery" index={index} issue={validationError} />

          <View style={[styles.quantityRow, styles.metricRowSurface]}>
            <View style={styles.intervalMetricHeading}>
              <Text style={styles.intervalMetricLabel}>Repeats</Text>
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
          </> : null}
        </View>
        );
      })}
      <View style={styles.intervalActions}>
        <Pressable accessibilityRole="button" onPress={addInterval} style={({ pressed }) => [styles.addInterval, pressed && styles.pressed]}>
          <Text style={styles.addIntervalText}>+ Add interval</Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={1} onPress={onDone} style={({ pressed }) => [styles.intervalDoneAction, pressed && styles.pressed]}>
          <Text style={styles.intervalDoneActionText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildIntervalEditorSummary(interval: IntervalDraft) {
  const parts: string[] = [];
  if (interval.distance.trim()) {
    const distance = Number(interval.distance);
    parts.push(`${Number.isFinite(distance) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: false }).format(distance) : interval.distance} ${interval.distanceUnit}`);
  }
  const durationSeconds = getDurationSeconds(interval.timeMinutes, interval.timeSeconds);
  if (durationSeconds != null) parts.push(interval.distance.trim() ? formatDurationSeconds(durationSeconds) : `${formatDurationSeconds(durationSeconds)} work`);
  if (interval.recoverySeconds.trim()) parts.push(`${interval.recoverySeconds}s rec`);
  if (interval.quantity > 1) parts.push(`${interval.quantity}×`);
  return parts.join(" · ") || "No results yet";
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
  subtypeToggle: { ...compactSelectorShadowStyle, alignSelf: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", marginTop: spacing.sm, padding: 3 },
  subtypeOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.md },
  subtypeOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, elevation: 1, shadowColor: "#101318", shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.1, shadowRadius: 3, zIndex: 1 },
  subtypeText: { color: colors.muted, ...type.label },
  subtypeTextSelected: { color: colors.brand },
  editorSurface: { ...compactSelectorShadowStyle, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, padding: spacing.md },
  intervalScheme: { marginTop: spacing.sm },
  intervalDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginBottom: spacing.md, marginHorizontal: spacing.sm, marginTop: spacing.md },
  intervalHeader: { alignItems: "center", flexDirection: "row", minHeight: 44 },
  collapsedIntervalHeader: { ...compactControlShadowStyle, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.sm },
  intervalToggle: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minHeight: 44, minWidth: 0 },
  intervalTitle: { color: colors.ink, flexShrink: 0, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  intervalSummary: { color: colors.muted, flex: 1, flexShrink: 1, minWidth: 0, ...type.bodySmall },
  intervalNeedsDetails: { color: colors.brand, fontFamily: fonts.medium },
  removeButton: { alignItems: "center", flexShrink: 0, justifyContent: "center", minHeight: 44, paddingLeft: spacing.sm },
  removeAction: { color: colors.danger, ...type.label },
  metricField: { flex: 1, marginTop: 0 },
  unitToggle: { backgroundColor: "transparent", borderRadius: radii.sm, flexDirection: "row", padding: 2 },
  unitOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 38, minWidth: 38, paddingHorizontal: spacing.xs },
  unitOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, elevation: 1, shadowColor: "#101318", shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.1, shadowRadius: 3, zIndex: 1 },
  unitText: { color: colors.muted, ...type.label },
  unitTextSelected: { color: colors.brand },
  intervalMetricRow: { alignItems: "center", columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, rowGap: spacing.xs },
  firstMetricRow: { marginTop: 0 },
  metricRowSurface: { ...compactControlShadowStyle, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, minHeight: 56, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  intervalMetricLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, width: 64 },
  intervalMetricHeading: { flex: 1, minWidth: 120 },
  intervalMetricControls: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.xs, minWidth: 182 },
  intervalTimeControls: { flex: 1, gap: spacing.sm, marginTop: 0, minWidth: 168 },
  intervalTimeField: { width: 52 },
  integratedInput: { backgroundColor: "transparent", borderColor: colors.borderStrong, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, elevation: 0, minHeight: 44, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, shadowOpacity: 0 },
  integratedInputFocused: { borderBottomColor: colors.brand, borderBottomWidth: 2 },
  recoveryRow: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 132 },
  recoveryField: { marginTop: 0, width: 96 },
  unitLabel: { color: colors.muted, ...type.bodySmall },
  inlineError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.xs },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.sm },
  quantityHelper: { color: colors.muted, ...type.bodySmall, marginTop: 2 },
  quantityControl: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  quantityButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, height: 36, justifyContent: "center", width: 36 },
  quantityButtonDisabled: { opacity: 0.35 },
  quantitySymbol: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 20, lineHeight: 22 },
  quantityValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, minWidth: 24, textAlign: "center" },
  intervalActions: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.sm },
  addInterval: { ...compactControlShadowStyle, alignItems: "center", backgroundColor: colors.surface, borderColor: colors.success, borderRadius: radii.pill, borderWidth: 1, flexShrink: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  addIntervalText: { color: colors.success, ...type.label },
  intervalDoneAction: { ...compactControlShadowStyle, alignItems: "center", backgroundColor: colors.success, borderRadius: radii.md, flexShrink: 0, height: 42, justifyContent: "center", minWidth: 76, paddingHorizontal: spacing.lg },
  intervalDoneActionText: { color: colors.surface, ...type.label },
  doneAction: { ...compactControlShadowStyle, alignItems: "center", alignSelf: "flex-end", backgroundColor: colors.success, borderRadius: radii.md, height: 42, justifyContent: "center", marginTop: spacing.sm, minWidth: 76, paddingHorizontal: spacing.lg },
  doneActionText: { color: colors.surface, ...type.label },
  collapsedSurface: { ...compactControlShadowStyle, alignItems: "center", alignSelf: "stretch", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginTop: spacing.xxl, maxWidth: "100%", paddingHorizontal: spacing.md, paddingVertical: spacing.md, width: "100%" },
  collapsedCopy: { flex: 1, flexBasis: 0, gap: spacing.xs, minWidth: 0 },
  summaryText: { color: colors.ink, flexShrink: 1, ...type.bodyMedium },
  pressed: { opacity: 0.72 },
});
