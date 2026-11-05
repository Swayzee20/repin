import type { QuickLogMovementInput, WorkoutDetailMovement } from "@repin/types";

import {
  defaultMeasureForMovement,
  type MovementMeasure,
  type PickerMovement,
} from "./movement-picker-state";
import { size, spacing, type } from "./theme";

export type LoadUnit = "lb" | "kg";

export type DetailedSetDraft = { id: string; reps: string; load: string };

export type DetailedExerciseDraft = {
  defaultMeasure: MovementMeasure;
  equipment: string | null;
  id: string;
  movementId: string | null;
  movementName: string;
  sets: DetailedSetDraft[];
};

export type StrengthNumericField = "load" | "reps";

export type StrengthFieldRef = {
  exerciseIndex: number;
  field: StrengthNumericField;
  setIndex: number;
};

export type LoadUnitStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type SetRowSwipeRelease = "close" | "delete" | "reveal";

export const loadUnitStorageKey = "repin.loadUnit";
export const minSets = 1;
export const maxSets = 20;
export const undoToastMs = 4_000;
export const setDeleteRevealWidth = 80;
export const setRowDeleteVelocity = 0.5;
export const setRowPitch = size.control + spacing.sm;
export const setIndexWidth = size.iconButton;
export const setsStepperWidth = size.hit * 3;
export const setTableHeaderLetterSpacing = 0.4;
export const setRepsFlex = 44;
export const setLoadFlex = 56;
export const setTableHeaderHeight = type.label.lineHeight + spacing.xs;

export function parseStoredLoadUnit(value: string | null | undefined): LoadUnit {
  return value === "kg" ? "kg" : "lb";
}

export function defaultLoadUnitStore(): LoadUnitStore | null {
  try {
    const storage = globalThis.localStorage;
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") {
      return storage;
    }
  } catch {
    return null;
  }
  return null;
}

export function readStoredLoadUnit(store: LoadUnitStore | null | undefined = defaultLoadUnitStore()): LoadUnit {
  try {
    return parseStoredLoadUnit(store?.getItem(loadUnitStorageKey));
  } catch {
    return "lb";
  }
}

export function writeStoredLoadUnit(
  unit: LoadUnit,
  store: LoadUnitStore | null | undefined = defaultLoadUnitStore(),
) {
  try {
    store?.setItem(loadUnitStorageKey, unit);
  } catch {
    // Device storage can be unavailable in private web contexts.
  }
}

export function hydrateWorkoutLoadUnit(
  units: Array<string | null | undefined>,
  fallback: LoadUnit = "lb",
): LoadUnit {
  for (const unit of units) {
    if (unit === "kg" || unit === "lb") return unit;
  }
  return fallback;
}

export function hydrateWorkoutLoadUnitFromMovements(
  movements: WorkoutDetailMovement[],
  fallback: LoadUnit = "lb",
): LoadUnit {
  return hydrateWorkoutLoadUnit(
    movements.flatMap((movement) => movement.sets.map((set) => set.loadUnit)),
    fallback,
  );
}

export function draftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDetailedSet(
  id = draftId(),
  source?: Pick<DetailedSetDraft, "load" | "reps">,
): DetailedSetDraft {
  return { id, load: source?.load ?? "", reps: source?.reps ?? "" };
}

export function createDetailedExercise(
  id = draftId(),
  source?: Partial<Pick<DetailedExerciseDraft, "defaultMeasure" | "equipment" | "movementId" | "movementName">>,
): DetailedExerciseDraft {
  const movementName = source?.movementName ?? "";
  const movementId = source?.movementId ?? null;
  return {
    defaultMeasure: source?.defaultMeasure ?? defaultMeasureForMovement(movementName, !movementId),
    equipment: source?.equipment ?? null,
    id,
    movementId,
    movementName,
    sets: [createDetailedSet()],
  };
}

export function hydrateDetailedExercises(movements: WorkoutDetailMovement[]): DetailedExerciseDraft[] {
  return movements.map((movement) => ({
    defaultMeasure: defaultMeasureForMovement(movement.movementName, !movement.movementId),
    equipment: null,
    id: movement.id,
    movementId: movement.movementId,
    movementName: movement.movementName,
    sets: movement.sets.length
      ? movement.sets.map((set) => ({
          id: set.id,
          load: set.load == null ? "" : String(set.load),
          reps: set.reps == null ? "" : String(set.reps),
        }))
      : [createDetailedSet()],
  }));
}

export function exercisesFromPickerSelections(
  exercises: DetailedExerciseDraft[],
  selections: PickerMovement[],
  replaceId?: string | null,
) {
  if (!selections.length) return { exercises, expandedId: replaceId ?? exercises.at(-1)?.id ?? null };
  const drafts = selections.map((selection, index) => {
    const keep = replaceId && index === 0
      ? exercises.find((exercise) => exercise.id === replaceId)
      : undefined;
    return {
      defaultMeasure: selection.defaultMeasure,
      equipment: selection.equipment,
      id: keep?.id ?? draftId(),
      movementId: selection.movementId,
      movementName: selection.movementName,
      sets: keep?.sets ?? [createDetailedSet()],
    } satisfies DetailedExerciseDraft;
  });
  if (!replaceId) {
    const next = [...exercises, ...drafts];
    return { exercises: next, expandedId: drafts.at(-1)?.id ?? null };
  }
  const index = exercises.findIndex((exercise) => exercise.id === replaceId);
  if (index < 0) {
    const next = [...exercises, ...drafts];
    return { exercises: next, expandedId: drafts.at(-1)?.id ?? null };
  }
  const next = [...exercises.slice(0, index), ...drafts, ...exercises.slice(index + 1)];
  return { exercises: next, expandedId: drafts[0]?.id ?? replaceId };
}

export function appendCopiedSet(sets: DetailedSetDraft[], id = draftId()): DetailedSetDraft[] {
  if (sets.length >= maxSets) return sets;
  const last = sets[sets.length - 1];
  return [...sets, createDetailedSet(id, last)];
}

export function removeLastSet(sets: DetailedSetDraft[]): {
  index: number;
  removed: DetailedSetDraft;
  sets: DetailedSetDraft[];
} | null {
  if (sets.length <= minSets) return null;
  const index = sets.length - 1;
  const removed = sets[index];
  if (!removed) return null;
  return { index, removed, sets: sets.slice(0, -1) };
}

export function deleteSetAt(sets: DetailedSetDraft[], index: number): {
  index: number;
  removed: DetailedSetDraft;
  sets: DetailedSetDraft[];
} | null {
  if (sets.length <= minSets || index < 0 || index >= sets.length) return null;
  const removed = sets[index];
  if (!removed) return null;
  return {
    index,
    removed,
    sets: sets.filter((_, itemIndex) => itemIndex !== index),
  };
}

export function restoreSet(sets: DetailedSetDraft[], removed: DetailedSetDraft, index: number): DetailedSetDraft[] {
  const next = [...sets];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, removed);
  return next.slice(0, maxSets);
}

export function canAddSet(count: number) {
  return count < maxSets;
}

export function canRemoveSet(count: number) {
  return count > minSets;
}

export function formatExerciseSummary(sets: DetailedSetDraft[], loadUnit: LoadUnit): string {
  const filled = sets.filter((set) => set.reps.trim() || set.load.trim());
  if (!filled.length) return sets.length === 1 ? "1 set" : `${sets.length} sets`;

  const reps = filled.map((set) => set.reps.trim());
  const loads = filled.map((set) => set.load.trim());
  const sameReps = Boolean(reps[0]) && reps.every((value) => value === reps[0]);
  const sameLoad = Boolean(loads[0]) && loads.every((value) => value === loads[0]);
  if (sameReps && sameLoad) return `${filled.length}×${reps[0]} @ ${loads[0]} ${loadUnit}`;
  if (sameReps) return `${filled.length}×${reps[0]}`;
  return `${filled.length} sets`;
}

export function strengthNumericFields(exercises: { sets: readonly unknown[] }[]): StrengthFieldRef[] {
  const fields: StrengthFieldRef[] = [];
  exercises.forEach((exercise, exerciseIndex) => {
    exercise.sets.forEach((_set, setIndex) => {
      fields.push({ exerciseIndex, field: "reps", setIndex });
      fields.push({ exerciseIndex, field: "load", setIndex });
    });
  });
  return fields;
}

export function fieldRefIndex(fields: StrengthFieldRef[], current: StrengthFieldRef) {
  return fields.findIndex(
    (field) =>
      field.exerciseIndex === current.exerciseIndex
      && field.setIndex === current.setIndex
      && field.field === current.field,
  );
}

export function nextStrengthField(fields: StrengthFieldRef[], current: StrengthFieldRef): StrengthFieldRef | null {
  const index = fieldRefIndex(fields, current);
  if (index < 0 || index >= fields.length - 1) return null;
  return fields[index + 1] ?? null;
}

export function prevStrengthField(fields: StrengthFieldRef[], current: StrengthFieldRef): StrengthFieldRef | null {
  const index = fieldRefIndex(fields, current);
  if (index <= 0) return null;
  return fields[index - 1] ?? null;
}

export function strengthFieldKey(setId: string, field: StrengthNumericField) {
  return `${setId}:${field}`;
}

export function strengthAccessoryContext({
  exerciseIndex,
  exerciseName,
  field,
  setIndex,
}: {
  exerciseIndex: number;
  exerciseName: string;
  field: StrengthNumericField;
  setIndex: number;
}) {
  const name = exerciseName.trim() || `Exercise ${exerciseIndex + 1}`;
  return `${name} · Set ${setIndex + 1} · ${field === "reps" ? "Reps" : "Weight"}`;
}

export function clampSetRowTranslate(dx: number, rowWidth: number) {
  if (!Number.isFinite(dx) || dx > 0) return 0;
  const limit = Number.isFinite(rowWidth) && rowWidth > 0 ? -rowWidth : -setDeleteRevealWidth * 1.5;
  return Math.max(limit, dx);
}

export function setRowSwipeRelease(dx: number, vx: number): SetRowSwipeRelease {
  if (dx < -setDeleteRevealWidth || vx <= -setRowDeleteVelocity) return "delete";
  if (dx <= -setDeleteRevealWidth / 2) return "reveal";
  return "close";
}

export function deletedSetMessage(setNumber: number) {
  return `Set ${setNumber} deleted`;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (!item) return items;
  next.splice(target, 0, item);
  return next;
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

export function buildDetailedMovements(
  exercises: DetailedExerciseDraft[],
  loadUnit: LoadUnit,
): QuickLogMovementInput[] {
  return exercises.map((exercise) => ({
    movementId: exercise.movementId,
    movementName: exercise.movementName.trim(),
    sets: exercise.sets.flatMap((set) => {
      const hasReps = Boolean(set.reps.trim());
      const hasLoad = Boolean(set.load.trim());
      if (!hasReps && !hasLoad) return [];
      return [{
        load: hasLoad ? Number(set.load) : null,
        loadUnit: hasLoad ? loadUnit : null,
        reps: hasReps ? Number(set.reps) : null,
      }];
    }),
  }));
}

export function showsAndroidKeyboardAccessory(context: string | undefined, keyboardVisible: boolean) {
  return Boolean(context) && keyboardVisible;
}
