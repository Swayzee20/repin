import type {
  MovementSummary,
  QuickLogMetricInput,
  QuickLogMovementInput,
  WorkoutType,
} from "@repin/types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import { TextField } from "./components";
import { colors, fonts, radii, spacing, type } from "./theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type DistanceUnit = "mi" | "km";
type LoadUnit = "lb" | "kg";
type FunctionalResultType = "time" | "rounds" | "score";
type SetDraft = { id: string; reps: string; load: string; quantity: number };
type ExerciseDraft = {
  id: string;
  movementId: string | null;
  movementName: string;
  loadUnit: LoadUnit;
  sets: SetDraft[];
};

export interface QuickLogResultsDraft {
  distance: string;
  distanceUnit: DistanceUnit;
  duration: string;
  functionalResultType: FunctionalResultType | null;
  rounds: string;
  score: string;
  exercises: ExerciseDraft[];
}

export const emptyQuickLogResults: QuickLogResultsDraft = {
  distance: "",
  distanceUnit: "mi",
  duration: "",
  functionalResultType: null,
  rounds: "",
  score: "",
  exercises: [],
};

export function QuickLogResultsFields({
  onChange,
  value,
  workoutType,
}: {
  onChange: (value: QuickLogResultsDraft) => void;
  value: QuickLogResultsDraft;
  workoutType: WorkoutType | null;
}) {
  const isDistance = workoutType === "run" || workoutType === "walk";
  const isStrength = workoutType === "strength_training" || workoutType === "powerlifting";
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
            <TextField containerStyle={styles.metricField} inputMode="decimal" onChangeText={(distance) => update({ distance })} placeholder="3.2" value={value.distance} />
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
            <TextField containerStyle={styles.resultField} inputMode="numeric" onChangeText={(rounds) => update({ rounds })} placeholder="5" value={value.rounds} />
          ) : null}
          {value.functionalResultType === "score" ? (
            <TextField containerStyle={styles.resultField} maxLength={500} onChangeText={(score) => update({ score })} placeholder="5 rounds + 12 reps" value={value.score} />
          ) : null}
        </View>
      ) : null}

      {showTime ? (
        <View style={styles.section}>
          <FieldLabel label="Time" />
          <TextField containerStyle={styles.timeField} inputMode="numeric" onChangeText={(duration) => update({ duration })} placeholder="28:14" value={value.duration} />
          <Text style={styles.hint}>MM:SS or H:MM:SS</Text>
        </View>
      ) : null}

      {isStrength ? (
        <View style={styles.section}>
          <FieldLabel label="Exercises" />
          {value.exercises.map((exercise, index) => (
            <ExerciseEditor
              exercise={exercise}
              index={index}
              key={exercise.id}
              onChange={(nextExercise) => update({
                exercises: value.exercises.map((item) => item.id === exercise.id ? nextExercise : item),
              })}
              onRemove={() => update({ exercises: value.exercises.filter((item) => item.id !== exercise.id) })}
            />
          ))}
          <Pressable accessibilityRole="button" onPress={() => update({ exercises: [...value.exercises, createExerciseDraft()] })} style={({ pressed }) => [styles.addAction, pressed && styles.pressed]}>
            <Text style={styles.actionText}>+ Add exercise</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function ExerciseEditor({
  exercise,
  index,
  onChange,
  onRemove,
}: {
  exercise: ExerciseDraft;
  index: number;
  onChange: (exercise: ExerciseDraft) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MovementSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const updateSet = (setId: string, change: Partial<SetDraft>) => onChange({
    ...exercise,
    sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...change } : set),
  });

  useEffect(() => {
    const query = exercise.movementName.trim();
    if (query.length < 2 || exercise.movementId || !supabase) {
      setSuggestions([]);
      return;
    }
    const supabaseClient = supabase;
    const timer = setTimeout(() => {
      void supabaseClient.auth.getSession().then(async ({ data }) => {
        if (!data.session) return;
        const response = await fetch(`${apiUrl}/api/movements?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        }).catch(() => null);
        if (!response?.ok) return;
        const body = (await response.json()) as { movements?: MovementSummary[] };
        setSuggestions(body.movements ?? []);
        setShowSuggestions(Boolean(body.movements?.length));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [exercise.movementId, exercise.movementName]);

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseTitle}>Exercise {index + 1}</Text>
        <Pressable accessibilityRole="button" onPress={onRemove}><Text style={styles.removeText}>Remove</Text></Pressable>
      </View>
      <TextField
        label="Exercise name"
        onChangeText={(movementName) => {
          onChange({ ...exercise, movementId: null, movementName });
          setShowSuggestions(true);
        }}
        placeholder="Bench Press"
        value={exercise.movementName}
      />
      {showSuggestions ? (
        <View style={styles.suggestions}>
          {suggestions.map((movement) => (
            <Pressable
              accessibilityRole="button"
              key={movement.id}
              onPress={() => {
                onChange({ ...exercise, movementId: movement.id, movementName: movement.name });
                setShowSuggestions(false);
              }}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <Text style={styles.suggestionName}>{movement.name}</Text>
              {movement.equipment ? <Text style={styles.suggestionMeta}>{movement.equipment}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.unitRow}>
        <Text style={styles.unitLabel}>Weight unit</Text>
        <ChoiceToggle<LoadUnit> onChange={(loadUnit) => loadUnit && onChange({ ...exercise, loadUnit })} options={["lb", "kg"]} value={exercise.loadUnit} />
      </View>

      {exercise.sets.map((set, setIndex) => (
        <View key={set.id} style={styles.setRow}>
          <Text style={styles.setIndex}>{setIndex + 1}</Text>
          <TextField containerStyle={styles.setInput} inputMode="numeric" label="Reps" onChangeText={(reps) => updateSet(set.id, { reps })} placeholder="8" value={set.reps} />
          <TextField containerStyle={styles.setInput} inputMode="decimal" label="Weight" onChangeText={(load) => updateSet(set.id, { load })} placeholder="185" value={set.load} />
          <View style={styles.quantityField}>
            <Text style={styles.quantityLabel}>Sets</Text>
            <View style={styles.quantityControl}>
              <Pressable accessibilityLabel="Decrease identical sets" accessibilityRole="button" onPress={() => updateSet(set.id, { quantity: Math.max(1, set.quantity - 1) })} style={styles.quantityButton}><Text style={styles.quantityButtonText}>−</Text></Pressable>
              <Text style={styles.quantityValue}>{set.quantity}</Text>
              <Pressable accessibilityLabel="Increase identical sets" accessibilityRole="button" onPress={() => updateSet(set.id, { quantity: Math.min(20, set.quantity + 1) })} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></Pressable>
            </View>
          </View>
          <Pressable accessibilityLabel="Remove set row" accessibilityRole="button" hitSlop={8} onPress={() => onChange({ ...exercise, sets: exercise.sets.filter((item) => item.id !== set.id) })} style={styles.removeSet}><Text style={styles.removeSetText}>×</Text></Pressable>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => onChange({ ...exercise, sets: [...exercise.sets, createSetDraft()] })} style={({ pressed }) => [styles.inlineAdd, pressed && styles.pressed]}>
        <Text style={styles.actionText}>+ Add set</Text>
      </Pressable>
    </View>
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
  if (usesTime && value.duration.trim() && parseDurationSeconds(value.duration) === null) {
    return "Enter time as MM:SS or H:MM:SS.";
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "rounds" && value.rounds.trim()) {
    const rounds = Number(value.rounds);
    if (!Number.isInteger(rounds) || rounds <= 0) return "Rounds must be a positive whole number.";
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "score" && !value.score.trim()) {
    return "Enter a score or clear the Score result type.";
  }
  if (workoutType === "strength_training" || workoutType === "powerlifting") {
    for (const exercise of value.exercises) {
      if (!exercise.movementName.trim()) return "Add an exercise name or remove the empty exercise.";
      for (const set of exercise.sets) {
        if (!set.reps.trim() && !set.load.trim()) continue;
        if (set.reps.trim()) {
          const reps = Number(set.reps);
          if (!Number.isInteger(reps) || reps <= 0) return `Enter positive whole-number reps for ${exercise.movementName}.`;
        }
        if (set.load.trim()) {
          const load = Number(set.load);
          if (!Number.isFinite(load) || load < 0) return `Enter a non-negative weight for ${exercise.movementName}.`;
        }
      }
    }
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
  const durationSeconds = usesTime ? parseDurationSeconds(value.duration) : null;
  if (durationSeconds != null) metrics.push({ metricType: "duration", numericValue: durationSeconds, unit: "seconds" });
  if (workoutType === "functional_fitness" && value.functionalResultType === "rounds" && value.rounds.trim()) {
    metrics.push({ metricType: "rounds", numericValue: Number(value.rounds), unit: "rounds" });
  }
  if (workoutType === "functional_fitness" && value.functionalResultType === "score" && value.score.trim()) {
    metrics.push({ metricType: "score", textValue: value.score.trim() });
  }

  const movements: QuickLogMovementInput[] = workoutType === "strength_training" || workoutType === "powerlifting"
    ? value.exercises.map((exercise) => ({
        movementId: exercise.movementId,
        movementName: exercise.movementName.trim(),
        sets: exercise.sets.flatMap((set) => {
          const hasReps = Boolean(set.reps.trim());
          const hasLoad = Boolean(set.load.trim());
          if (!hasReps && !hasLoad) return [];
          return Array.from({ length: set.quantity }, () => ({
            reps: hasReps ? Number(set.reps) : null,
            load: hasLoad ? Number(set.load) : null,
            loadUnit: hasLoad ? exercise.loadUnit : null,
          }));
        }),
      }))
    : [];

  return { metrics, movements, durationSeconds };
}

function parseDurationSeconds(value: string) {
  if (!value.trim()) return null;
  const parts = value.trim().split(":");
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.at(-1) ?? 0;
  const minutes = numbers.at(-2) ?? 0;
  const hours = numbers.length === 3 ? (numbers[0] ?? 0) : 0;
  if (seconds > 59 || minutes > 59 || hours > 23) return null;
  const total = hours * 3_600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

function createSetDraft(): SetDraft {
  return { id: draftId(), reps: "", load: "", quantity: 1 };
}

function createExerciseDraft(): ExerciseDraft {
  return { id: draftId(), movementId: null, movementName: "", loadUnit: "lb", sets: [createSetDraft()] };
}

function draftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xxl },
  sectionTitle: { color: colors.ink, ...type.heading },
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
  optional: { color: colors.muted, ...type.label },
  metricRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  metricField: { flex: 1, marginTop: 0 },
  resultField: { marginTop: spacing.sm },
  timeField: { marginTop: spacing.sm, maxWidth: 180 },
  hint: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  toggle: { alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", marginTop: spacing.sm, padding: 3 },
  toggleOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 36, minWidth: 48, paddingHorizontal: spacing.md },
  toggleOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  toggleText: { color: colors.muted, ...type.label },
  toggleTextSelected: { color: colors.ink },
  exerciseCard: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  exerciseHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  exerciseTitle: { color: colors.ink, ...type.label },
  removeText: { color: colors.muted, ...type.label },
  suggestions: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, marginTop: spacing.xs, overflow: "hidden" },
  suggestion: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionName: { color: colors.ink, ...type.label },
  suggestionMeta: { color: colors.muted, ...type.bodySmall },
  unitRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  unitLabel: { color: colors.muted, ...type.bodySmall },
  setRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  setIndex: { color: colors.muted, ...type.bodySmall, lineHeight: 42, width: 18 },
  setInput: { flex: 1 },
  quantityField: { gap: spacing.xs },
  quantityLabel: { color: colors.inkSoft, ...type.label },
  quantityControl: { alignItems: "center", borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", height: 42 },
  quantityButton: { alignItems: "center", height: 40, justifyContent: "center", width: 28 },
  quantityButtonText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 18 },
  quantityValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, minWidth: 16, textAlign: "center" },
  removeSet: { alignItems: "center", height: 42, justifyContent: "center", width: 22 },
  removeSetText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 20 },
  addAction: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.md, minHeight: 44, paddingRight: spacing.lg },
  inlineAdd: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.sm, minHeight: 40, paddingRight: spacing.lg },
  actionText: { color: colors.brand, ...type.label },
  pressed: { opacity: 0.72 },
});
