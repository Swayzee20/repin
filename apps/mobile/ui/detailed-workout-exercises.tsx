import type { MovementSummary, QuickLogMovementInput, WorkoutDetailMovement } from "@repin/types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import { TextField } from "./components";
import { colors, fonts, radii, spacing, type } from "./theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type LoadUnit = "lb" | "kg";
type DetailedSetDraft = { id: string; reps: string; load: string };

export type DetailedExerciseDraft = {
  id: string;
  movementId: string | null;
  movementName: string;
  loadUnit: LoadUnit;
  sets: DetailedSetDraft[];
};

export function hydrateDetailedExercises(movements: WorkoutDetailMovement[]): DetailedExerciseDraft[] {
  return movements.map((movement) => {
    const loadUnit: LoadUnit = movement.sets.find((set) => set.loadUnit === "kg") ? "kg" : "lb";
    return {
      id: movement.id,
      movementId: movement.movementId,
      movementName: movement.movementName,
      loadUnit,
      sets: movement.sets.length
        ? movement.sets.map((set) => ({
            id: set.id,
            reps: set.reps == null ? "" : String(set.reps),
            load: set.load == null ? "" : String(set.load),
          }))
        : [createDetailedSet()],
    };
  });
}

export function DetailedExerciseFields({
  exercises,
  onChange,
}: {
  exercises: DetailedExerciseDraft[];
  onChange: (exercises: DetailedExerciseDraft[]) => void;
}) {
  return (
    <View>
      {exercises.map((exercise, index) => (
        <DetailedExerciseEditor
          exercise={exercise}
          index={index}
          key={exercise.id}
          onChange={(nextExercise) => onChange(
            exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          )}
          onRemove={() => onChange(exercises.filter((item) => item.id !== exercise.id))}
        />
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange([...exercises, createDetailedExercise()])}
        style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
      >
        <Text style={styles.actionText}>+ Add exercise</Text>
      </Pressable>
    </View>
  );
}

function DetailedExerciseEditor({
  exercise,
  index,
  onChange,
  onRemove,
}: {
  exercise: DetailedExerciseDraft;
  index: number;
  onChange: (exercise: DetailedExerciseDraft) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MovementSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const updateSet = (setId: string, change: Partial<DetailedSetDraft>) => onChange({
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
        <Text style={styles.exerciseTitle}>{exercise.movementName.trim() || `Exercise ${index + 1}`}</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onRemove}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      <TextField
        compact
        label="Exercise name"
        onChangeText={(movementName) => {
          onChange({ ...exercise, movementId: null, movementName });
          setShowSuggestions(true);
        }}
        placeholder="Barbell Bench Press"
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
        <View style={styles.unitToggle}>
          {(["lb", "kg"] as const).map((unit) => (
            <Pressable
              accessibilityRole="button"
              key={unit}
              onPress={() => onChange({ ...exercise, loadUnit: unit })}
              style={[styles.unitOption, exercise.loadUnit === unit && styles.unitOptionSelected]}
            >
              <Text style={[styles.unitOptionText, exercise.loadUnit === unit && styles.unitOptionTextSelected]}>{unit}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {exercise.sets.map((set, setIndex) => (
        <View key={set.id} style={styles.setCard}>
          <View style={styles.setHeader}>
            <Text style={styles.setTitle}>Set {setIndex + 1}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onChange({ ...exercise, sets: exercise.sets.filter((item) => item.id !== set.id) })}
            >
              <Text style={styles.removeSetText}>Remove</Text>
            </Pressable>
          </View>
          <View style={styles.setFields}>
            <TextField compact containerStyle={styles.setInput} inputMode="numeric" keyboardType="number-pad" label="Reps" onChangeText={(reps) => updateSet(set.id, { reps })} placeholder="10" value={set.reps} />
            <TextField compact containerStyle={styles.setInput} inputMode="decimal" keyboardType="decimal-pad" label={`Weight (${exercise.loadUnit})`} onChangeText={(load) => updateSet(set.id, { load })} placeholder="185" value={set.load} />
          </View>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => onChange({ ...exercise, sets: [...exercise.sets, createDetailedSet()] })}
        style={({ pressed }) => [styles.addSet, pressed && styles.pressed]}
      >
        <Text style={styles.actionText}>+ Add set</Text>
      </Pressable>
    </View>
  );
}

export function validateDetailedExercises(exercises: DetailedExerciseDraft[]) {
  for (const exercise of exercises) {
    if (!exercise.movementName.trim()) {
      return "Add an exercise name or remove the empty exercise.";
    }
    for (const set of exercise.sets) {
      if (!set.reps.trim() && !set.load.trim()) continue;
      if (set.reps.trim()) {
        const reps = Number(set.reps);
        if (!Number.isInteger(reps) || reps <= 0) {
          return `Enter positive whole-number reps for ${exercise.movementName}.`;
        }
      }
      if (set.load.trim()) {
        const load = Number(set.load);
        if (!Number.isFinite(load) || load < 0) {
          return `Enter a non-negative weight for ${exercise.movementName}.`;
        }
      }
    }
  }
  return null;
}

export function buildDetailedMovements(exercises: DetailedExerciseDraft[]): QuickLogMovementInput[] {
  return exercises.map((exercise) => ({
    movementId: exercise.movementId,
    movementName: exercise.movementName.trim(),
    sets: exercise.sets.flatMap((set) => {
      const hasReps = Boolean(set.reps.trim());
      const hasLoad = Boolean(set.load.trim());
      if (!hasReps && !hasLoad) return [];
      return [{
        reps: hasReps ? Number(set.reps) : null,
        load: hasLoad ? Number(set.load) : null,
        loadUnit: hasLoad ? exercise.loadUnit : null,
      }];
    }),
  }));
}

function createDetailedExercise(): DetailedExerciseDraft {
  return {
    id: draftId(),
    movementId: null,
    movementName: "",
    loadUnit: "lb",
    sets: [createDetailedSet()],
  };
}

function createDetailedSet(): DetailedSetDraft {
  return { id: draftId(), reps: "", load: "" };
}

function draftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const styles = StyleSheet.create({
  exerciseCard: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  exerciseHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  exerciseTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  removeText: { color: colors.muted, ...type.label },
  suggestions: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, marginTop: spacing.xs, overflow: "hidden" },
  suggestion: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionName: { color: colors.ink, ...type.label },
  suggestionMeta: { color: colors.muted, ...type.bodySmall },
  unitRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  unitLabel: { color: colors.muted, ...type.bodySmall },
  unitToggle: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", padding: 3 },
  unitOption: { alignItems: "center", borderRadius: radii.sm, justifyContent: "center", minHeight: 34, minWidth: 48 },
  unitOptionSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  unitOptionText: { color: colors.muted, ...type.label },
  unitOptionTextSelected: { color: colors.ink },
  setCard: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md },
  setHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  setTitle: { color: colors.inkSoft, ...type.label },
  removeSetText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  setFields: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  setInput: { flex: 1 },
  addSet: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.sm, minHeight: 40, paddingRight: spacing.lg },
  addExercise: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.md, minHeight: 44, paddingRight: spacing.lg },
  actionText: { color: colors.brand, ...type.label },
  pressed: { opacity: 0.7 },
});
