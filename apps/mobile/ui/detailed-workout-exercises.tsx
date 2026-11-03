import type { MovementSummary, QuickLogMovementInput, WorkoutDetailMovement } from "@repin/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import { TextField } from "./components";
import { NumberField } from "./form-fields";
import { fieldChainProps, type ReturnKeyType } from "./keyboard";
import { useInputRegistry } from "./keyboard-focus";
import { SegmentedControl } from "./primitives";
import { colors, fonts, radii, size, spacing, type } from "./theme";

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
  onAfterLast,
  onChange,
}: {
  exercises: DetailedExerciseDraft[];
  /** Return from the last set focuses the next field outside this list. */
  onAfterLast?: () => void;
  onChange: (exercises: DetailedExerciseDraft[]) => void;
}) {
  const names = useRef(new Map<string, () => void>());
  const registerName = useCallback((id: string, focus: (() => void) | null) => {
    if (focus) names.current.set(id, focus);
    else names.current.delete(id);
  }, []);

  return (
    <View>
      {exercises.map((exercise, index) => {
        const next = exercises[index + 1];
        const advances = Boolean(next) || Boolean(onAfterLast);
        return (
          <DetailedExerciseEditor
            exercise={exercise}
            index={index}
            key={exercise.id}
            leaveKey={advances ? "next" : "done"}
            onChange={(nextExercise) => onChange(
              exercises.map((item) => item.id === exercise.id ? nextExercise : item),
            )}
            onLeave={advances ? () => {
              if (next) names.current.get(next.id)?.();
              else onAfterLast?.();
            } : undefined}
            onRegisterFocus={registerName}
            onRemove={() => onChange(exercises.filter((item) => item.id !== exercise.id))}
          />
        );
      })}
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
  leaveKey = "done",
  onChange,
  onLeave,
  onRegisterFocus,
  onRemove,
}: {
  exercise: DetailedExerciseDraft;
  index: number;
  leaveKey?: ReturnKeyType;
  onChange: (exercise: DetailedExerciseDraft) => void;
  onLeave?: () => void;
  onRegisterFocus?: (id: string, focus: (() => void) | null) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MovementSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { focus, ref } = useInputRegistry();
  const firstSet = exercise.sets[0];
  const nameAdvances = Boolean(firstSet) || Boolean(onLeave);

  useEffect(() => {
    onRegisterFocus?.(exercise.id, () => focus("name"));
    return () => onRegisterFocus?.(exercise.id, null);
  }, [exercise.id, focus, onRegisterFocus]);
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
        label="Exercise name"
        onChangeText={(movementName) => {
          onChange({ ...exercise, movementId: null, movementName });
          setShowSuggestions(true);
        }}
        placeholder="Barbell Bench Press"
        ref={ref("name")}
        value={exercise.movementName}
        {...fieldChainProps({
          count: nameAdvances ? 2 : 1,
          index: 0,
          last: leaveKey,
          onAdvance: () => {
            if (firstSet) focus(`${firstSet.id}:reps`);
            else onLeave?.();
          },
          onFinish: onLeave,
        })}
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
        <SegmentedControl
          accessibilityLabel="Weight unit"
          onChange={(loadUnit) => {
            if (loadUnit) onChange({ ...exercise, loadUnit });
          }}
          options={[{ label: "lb", value: "lb" }, { label: "kg", value: "kg" }]}
          size="sm"
          style={styles.unitSegment}
          value={exercise.loadUnit}
        />
      </View>

      {exercise.sets.map((set, setIndex) => {
        const nextSet = exercise.sets[setIndex + 1];
        const loadAdvances = Boolean(nextSet) || Boolean(onLeave);
        return (
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
            <NumberField
              containerStyle={styles.setInput}
              kind="number"
              label="Reps"
              onChangeText={(reps) => updateSet(set.id, { reps })}
              placeholder="10"
              ref={ref(`${set.id}:reps`)}
              value={set.reps}
              {...fieldChainProps({
                count: 2,
                index: 0,
                onAdvance: () => focus(`${set.id}:load`),
              })}
            />
            <NumberField
              containerStyle={styles.setInput}
              kind="decimal"
              label="Weight"
              onChangeText={(load) => updateSet(set.id, { load })}
              placeholder="185"
              ref={ref(`${set.id}:load`)}
              suffix={exercise.loadUnit}
              value={set.load}
              {...fieldChainProps({
                count: loadAdvances ? 2 : 1,
                index: 0,
                last: leaveKey,
                onAdvance: () => {
                  if (nextSet) focus(`${nextSet.id}:reps`);
                  else onLeave?.();
                },
                onFinish: onLeave,
              })}
            />
          </View>
        </View>
        );
      })}

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
  exerciseTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  removeText: { color: colors.muted, ...type.label },
  suggestions: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, marginTop: spacing.xs, overflow: "hidden" },
  suggestion: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionName: { color: colors.ink, ...type.label },
  suggestionMeta: { color: colors.muted, ...type.bodySmall },
  unitRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  unitLabel: { color: colors.muted, ...type.bodySmall },
  unitSegment: { alignSelf: "center" },
  setCard: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md },
  setHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  setTitle: { color: colors.inkSoft, ...type.label },
  removeSetText: { color: colors.muted, fontFamily: fonts.medium, fontSize: type.label.fontSize, lineHeight: type.label.lineHeight },
  setFields: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  setInput: { flex: 1 },
  addSet: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.sm, minHeight: size.hit, paddingRight: spacing.lg },
  addExercise: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", marginTop: spacing.md, minHeight: size.hit, paddingRight: spacing.lg },
  actionText: { color: colors.brand, ...type.label },
  pressed: { opacity: 0.7 },
});
