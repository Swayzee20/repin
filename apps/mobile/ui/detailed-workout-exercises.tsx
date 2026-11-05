import type { MovementLastSession } from "@repin/types";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";

import { supabase } from "../lib/supabase";
import { Button, ContentOptionsMenu } from "./components";
import { Dialog } from "./dialog";
import { NumberField } from "./form-fields";
import { Chevron, Icon } from "./icons";
import { fieldChainProps, type ReturnKeyType } from "./keyboard";
import { useInputRegistry } from "./keyboard-focus";
import { MovementPicker } from "./movement-picker";
import { pickerMovementFromDraft, type PickerMovement } from "./movement-picker-state";
import { RoundIconButton, SegmentedControl } from "./primitives";
import { pressableFocused, webFocusRing } from "./focus-ring";
import {
  appendCopiedSet,
  applyLastSessionSets,
  canAddSet,
  canRemoveSet,
  clampSetRowTranslate,
  deleteSetAt,
  deletedSetMessage,
  exerciseHasTypedSets,
  exercisesFromPickerSelections,
  formatExerciseSummary,
  lastSessionFromResponse,
  lastSessionPath,
  lastSessionQuery,
  lastSessionViewRows,
  lastTimeAppliedMessage,
  lastTimePresentation,
  lastTimeUseBorder,
  lastTimeUseHeight,
  lastTimeUseWidth,
  moveItem,
  nextStrengthField,
  prevStrengthField,
  readSetsHintDismissed,
  removeLastSet,
  replaceDialogMaxWidth,
  replaceSetsBody,
  replaceSetsTitle,
  restoreSet,
  setDeleteRevealWidth,
  setIndexWidth,
  setLoadFlex,
  setRepsFlex,
  setRowPitch,
  setRowSwipeRelease,
  setTableHeaderHeight,
  setTableHeaderLetterSpacing,
  setsHintCopy,
  setsHintGotIt,
  setsHintHeight,
  setsStepperWidth,
  strengthAccessoryContext,
  strengthFieldKey,
  strengthNumericFields,
  undoToastMs,
  useUndoActionWidth,
  useUndoToastMs,
  writeSetsHintDismissed,
  type DetailedExerciseDraft,
  type DetailedSetDraft,
  type LoadUnit,
  type StrengthFieldRef,
  type StrengthNumericField,
} from "./strength-form-state";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import { CardHeading } from "./workout-form-frame";

export type { DetailedExerciseDraft, LoadUnit } from "./strength-form-state";
export {
  buildDetailedMovements,
  hydrateDetailedExercises,
  hydrateWorkoutLoadUnitFromMovements,
  previewStrengthSummary,
  readStoredLoadUnit,
  validateDetailedExercises,
  writeStoredLoadUnit,
} from "./strength-form-state";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function WorkoutUnitToggle({
  onChange,
  value,
}: {
  onChange: (unit: LoadUnit) => void;
  value: LoadUnit;
}) {
  return (
    <View style={styles.unitHit}>
      <SegmentedControl
        accessibilityLabel="Weight unit"
        onChange={(loadUnit) => {
          if (loadUnit) onChange(loadUnit);
        }}
        options={[{ label: "lb", value: "lb" }, { label: "kg", value: "kg" }]}
        size="sm"
        value={value}
      />
    </View>
  );
}

export type UseUndoToast = { message: string; restore: () => void };

export function DetailedExerciseFields({
  excludeSessionId,
  exercises,
  loadUnit,
  onAfterLast,
  onChange,
  onLoadUnitChange,
  onUseUndo,
}: {
  excludeSessionId?: string | null;
  exercises: DetailedExerciseDraft[];
  loadUnit: LoadUnit;
  onAfterLast?: () => void;
  onChange: (exercises: DetailedExerciseDraft[]) => void;
  onLoadUnitChange: (unit: LoadUnit) => void;
  onUseUndo?: (toast: UseUndoToast | null) => void;
}) {
  const { focus, ref } = useInputRegistry();
  const [expandedId, setExpandedId] = useState<string | null>(() => exercises.at(-1)?.id ?? null);
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => readSetsHintDismissed());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusKey = useRef<string | null>(null);
  const announcedHint = useRef(false);

  useEffect(() => {
    if (expandedId && exercises.some((exercise) => exercise.id === expandedId)) return;
    setExpandedId(exercises.at(-1)?.id ?? null);
  }, [exercises, expandedId]);

  useEffect(() => {
    if (!pendingFocusKey.current) return;
    const key = pendingFocusKey.current;
    pendingFocusKey.current = null;
    focus(key);
  }, [expandedId, exercises, focus]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const showUndo = useCallback((message: string, restore: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, restore });
    undoTimer.current = setTimeout(() => setUndo(null), undoToastMs);
  }, []);

  const dismissHint = useCallback(() => {
    writeSetsHintDismissed();
    setHintDismissed(true);
  }, []);

  useEffect(() => {
    if (hintDismissed || announcedHint.current) return;
    if (!exercises.some((exercise) => exercise.sets.length > 0)) return;
    announcedHint.current = true;
    void AccessibilityInfo.announceForAccessibility(setsHintCopy);
  }, [exercises, hintDismissed]);

  const numericFields = strengthNumericFields(exercises);
  const [picker, setPicker] = useState<{ exerciseId?: string } | null>(null);

  const confirmPicker = useCallback((selections: PickerMovement[]) => {
    const applied = exercisesFromPickerSelections(exercises, selections, picker?.exerciseId);
    onChange(applied.exercises);
    if (applied.expandedId) setExpandedId(applied.expandedId);
    setPicker(null);
  }, [exercises, onChange, picker]);

  const focusField = useCallback((target: StrengthFieldRef | null, fallback?: () => void) => {
    if (!target) {
      fallback?.();
      return;
    }
    const exercise = exercises[target.exerciseIndex];
    const set = exercise?.sets[target.setIndex];
    if (!exercise || !set) {
      fallback?.();
      return;
    }
    const key = strengthFieldKey(set.id, target.field);
    if (exercise.id !== expandedId) {
      pendingFocusKey.current = key;
      setExpandedId(exercise.id);
      return;
    }
    focus(key);
  }, [exercises, expandedId, focus]);

  return (
    <View>
      <CardHeading trailing={<WorkoutUnitToggle onChange={onLoadUnitChange} value={loadUnit} />}>
        Exercises
      </CardHeading>
      {exercises.map((exercise, index) => (
        <ExerciseCard
          excludeSessionId={excludeSessionId}
          exercise={exercise}
          expanded={exercise.id === expandedId}
          index={index}
          inputRef={ref}
          key={exercise.id}
          loadUnit={loadUnit}
          numericFields={numericFields}
          onAfterLast={onAfterLast}
          onChange={(nextExercise) => onChange(
            exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          )}
          onExpand={() => setExpandedId(exercise.id)}
          onFocusField={focusField}
          onMove={(direction) => onChange(moveItem(exercises, index, direction))}
          onPickName={() => setPicker({ exerciseId: exercise.id })}
          onRemove={() => onChange(exercises.filter((item) => item.id !== exercise.id))}
          onUndo={showUndo}
          onUseUndo={onUseUndo}
          showSetsHint={!hintDismissed && exercise.id === expandedId}
          onDismissHint={dismissHint}
        />
      ))}
      <AddExerciseButton onPress={() => setPicker({})} />
      <MovementPicker
        initialSelection={picker?.exerciseId
          ? pickerSelectionFor(exercises, picker.exerciseId)
          : []}
        onConfirm={confirmPicker}
        onDismiss={() => setPicker(null)}
        visible={picker !== null}
      />
      {undo ? (
        <View accessibilityLiveRegion="polite" style={styles.undoToast}>
          <Text style={styles.undoMessage}>{undo.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (undoTimer.current) clearTimeout(undoTimer.current);
              undo.restore();
              setUndo(null);
            }}
            style={(state) => [styles.undoAction, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
          >
            <Text style={styles.undoActionLabel}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function AddExerciseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [styles.addExercise, state.pressed && styles.addExercisePressed, webFocusRing(pressableFocused(state))]}
    >
      <Icon color={colors.brandPressed} name="plus" size={size.icon.sm} />
      <Text style={styles.addExerciseLabel}>Add exercise</Text>
    </Pressable>
  );
}

function pickerSelectionFor(exercises: DetailedExerciseDraft[], exerciseId: string): PickerMovement[] {
  const exercise = exercises.find((item) => item.id === exerciseId);
  if (!exercise?.movementName.trim()) return [];
  return [pickerMovementFromDraft(exercise)];
}

function ExerciseCard({
  excludeSessionId,
  exercise,
  expanded,
  index,
  inputRef,
  loadUnit,
  numericFields,
  onAfterLast,
  onChange,
  onDismissHint,
  onExpand,
  onFocusField,
  onMove,
  onPickName,
  onRemove,
  onUndo,
  onUseUndo,
  showSetsHint,
}: {
  excludeSessionId?: string | null;
  exercise: DetailedExerciseDraft;
  expanded: boolean;
  index: number;
  inputRef: ReturnType<typeof useInputRegistry>["ref"];
  loadUnit: LoadUnit;
  numericFields: StrengthFieldRef[];
  onAfterLast?: () => void;
  onChange: (exercise: DetailedExerciseDraft) => void;
  onDismissHint: () => void;
  onExpand: () => void;
  onFocusField: (target: StrengthFieldRef | null, fallback?: () => void) => void;
  onMove: (direction: -1 | 1) => void;
  onPickName: () => void;
  onRemove: () => void;
  onUndo: (message: string, restore: () => void) => void;
  onUseUndo?: (toast: UseUndoToast | null) => void;
  showSetsHint: boolean;
}) {
  const name = exercise.movementName.trim() || `Exercise ${index + 1}`;
  const lastSession = useLastMovementSession(
    exercise.movementId,
    exercise.movementName,
    excludeSessionId,
  );
  const lastTime = lastSession ? lastTimePresentation(lastSession.sets, loadUnit) : null;
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const pendingReplace = useRef<{ next: DetailedSetDraft[]; previous: DetailedSetDraft[] } | null>(null);

  const updateSets = (sets: DetailedSetDraft[], keepUseUndo = false) => {
    onChange({ ...exercise, sets });
    if (!keepUseUndo) onUseUndo?.(null);
  };
  const applyDelete = (indexToRemove: number) => {
    const snapshot = deleteSetAt(exercise.sets, indexToRemove);
    if (!snapshot) return;
    updateSets(snapshot.sets);
    onUndo(deletedSetMessage(snapshot.index + 1), () => updateSets(restoreSet(snapshot.sets, snapshot.removed, snapshot.index)));
  };
  const commitLastTime = (snapshot: { next: DetailedSetDraft[]; previous: DetailedSetDraft[] }) => {
    updateSets(snapshot.next, true);
    onUseUndo?.({
      message: lastTimeAppliedMessage,
      restore: () => updateSets(snapshot.previous),
    });
  };
  const requestLastTime = () => {
    if (!lastSession) return;
    const snapshot = applyLastSessionSets(exercise.sets, lastSession.sets, loadUnit);
    if (!snapshot) return;
    if (exerciseHasTypedSets(exercise.sets)) {
      pendingReplace.current = snapshot;
      setReplaceOpen(true);
      return;
    }
    commitLastTime(snapshot);
  };
  const confirmReplace = () => {
    const snapshot = pendingReplace.current;
    pendingReplace.current = null;
    setReplaceOpen(false);
    if (snapshot) commitLastTime(snapshot);
  };
  const cancelReplace = () => {
    pendingReplace.current = null;
    setReplaceOpen(false);
  };

  if (!expanded) {
    return (
      <Pressable
        accessibilityHint="Shows the set table"
        accessibilityLabel={`${name}, ${formatExerciseSummary(exercise.sets, loadUnit)}`}
        accessibilityRole="button"
        onPress={onExpand}
        style={(state) => [styles.summaryRow, state.pressed && styles.summaryPressed, webFocusRing(pressableFocused(state))]}
      >
        <View style={styles.summaryCopy}>
          <Text numberOfLines={1} style={styles.summaryName}>{name}</Text>
          <Text numberOfLines={1} style={styles.summaryMeta}>{formatExerciseSummary(exercise.sets, loadUnit)}</Text>
        </View>
        <Chevron direction="down" />
      </Pressable>
    );
  }

  const meta = exercise.equipment
    ? `${exercise.equipment} · tap name to change`
    : "tap name to change";

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseTitleBlock}>
          <Pressable
            accessibilityHint="Opens the movement picker"
            accessibilityLabel={`${name}, change exercise`}
            accessibilityRole="button"
            onPress={onPickName}
            style={(state) => [styles.exerciseNameHit, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
          >
            <Text numberOfLines={1} style={styles.exerciseName}>{name}</Text>
          </Pressable>
          <Text style={styles.exerciseMeta}>{meta}</Text>
        </View>
        <ContentOptionsMenu
          accessibilityLabel={`${name} options`}
          items={[
            { label: "Move up", onPress: () => onMove(-1) },
            { label: "Move down", onPress: () => onMove(1) },
            ...(canRemoveSet(exercise.sets.length)
              ? [{ danger: true, label: "Delete set", onPress: () => applyDelete(exercise.sets.length - 1) }]
              : []),
            { danger: true, icon: "trash" as const, label: "Delete exercise", onPress: onRemove },
          ]}
        />
      </View>
      {lastTime ? (
        <LastTimeRow
          kind={lastTime.kind}
          label={lastTime.label}
          onUse={requestLastTime}
          onView={lastTime.kind === "mixed" ? () => setViewOpen(true) : undefined}
        />
      ) : null}
      <View style={styles.tableHeader} accessibilityElementsHidden>
        <Text style={[styles.tableHeading, styles.setIndex]} >Set</Text>
        <Text style={[styles.tableHeading, styles.repsColumn]}>Reps</Text>
        <Text style={[styles.tableHeading, styles.loadColumn]}>Weight ({loadUnit})</Text>
      </View>

      {exercise.sets.map((set, setIndex) => (
        <SetRow
          canDelete={canRemoveSet(exercise.sets.length)}
          exerciseIndex={index}
          exerciseName={exercise.movementName}
          inputRef={inputRef}
          key={set.id}
          loadUnit={loadUnit}
          numericFields={numericFields}
          onAfterLast={onAfterLast}
          onChange={(change) => updateSets(exercise.sets.map((item) => item.id === set.id ? { ...item, ...change } : item))}
          onDelete={() => applyDelete(setIndex)}
          onFocusField={onFocusField}
          set={set}
          setIndex={setIndex}
        />
      ))}

      <SetsStepper
        count={exercise.sets.length}
        onAdd={() => updateSets(appendCopiedSet(exercise.sets))}
        onRemove={() => {
          const snapshot = removeLastSet(exercise.sets);
          if (!snapshot) return;
          updateSets(snapshot.sets);
          onUndo(deletedSetMessage(snapshot.index + 1), () => updateSets(restoreSet(snapshot.sets, snapshot.removed, snapshot.index)));
        }}
      />
      {showSetsHint ? <SetsHint onDismiss={onDismissHint} /> : null}
      <ReplaceSetsDialog
        onCancel={cancelReplace}
        onReplace={confirmReplace}
        visible={replaceOpen}
      />
      {lastSession && lastTime?.kind === "mixed" ? (
        <LastSessionViewDialog
          loadUnit={loadUnit}
          name={name}
          onDismiss={() => setViewOpen(false)}
          sets={lastSession.sets}
          visible={viewOpen}
        />
      ) : null}
    </View>
  );
}

function SetRow({
  canDelete,
  exerciseIndex,
  exerciseName,
  inputRef,
  loadUnit,
  numericFields,
  onAfterLast,
  onChange,
  onDelete,
  onFocusField,
  set,
  setIndex,
}: {
  canDelete: boolean;
  exerciseIndex: number;
  exerciseName: string;
  inputRef: ReturnType<typeof useInputRegistry>["ref"];
  loadUnit: LoadUnit;
  numericFields: StrengthFieldRef[];
  onAfterLast?: () => void;
  onChange: (change: Partial<DetailedSetDraft>) => void;
  onDelete: () => void;
  onFocusField: (target: StrengthFieldRef | null, fallback?: () => void) => void;
  set: DetailedSetDraft;
  setIndex: number;
}) {
  const repsRef: StrengthFieldRef = { exerciseIndex, field: "reps", setIndex };
  const loadRef: StrengthFieldRef = { exerciseIndex, field: "load", setIndex };
  const handleAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "delete" && canDelete) onDelete();
  };

  return (
    <SwipeableSetRow
      accessibilityActions={canDelete ? [{ name: "delete", label: "Delete set" }] : undefined}
      accessibilityHint={canDelete ? "Swipe left to delete this set" : undefined}
      accessibilityLabel={`Set ${setIndex + 1}, ${set.reps || "no"} reps, ${set.load || "no"} ${loadUnit}`}
      canDelete={canDelete}
      onAccessibilityAction={handleAction}
      onDelete={onDelete}
    >
      <View style={styles.setRow}>
        <Text style={styles.setIndexLabel}>{setIndex + 1}</Text>
        <SetNumberField
          current={repsRef}
          exerciseName={exerciseName}
          field="reps"
          inputRef={inputRef}
          kind="number"
          label="Reps"
          numericFields={numericFields}
          onAfterLast={onAfterLast}
          onChangeText={(reps) => onChange({ reps })}
          onFocusField={onFocusField}
          set={set}
          value={set.reps}
        />
        <SetNumberField
          current={loadRef}
          exerciseName={exerciseName}
          field="load"
          inputRef={inputRef}
          kind="decimal"
          label="Weight"
          numericFields={numericFields}
          onAfterLast={onAfterLast}
          onChangeText={(load) => onChange({ load })}
          onFocusField={onFocusField}
          set={set}
          value={set.load}
        />
      </View>
    </SwipeableSetRow>
  );
}

function SetNumberField({
  current,
  exerciseName,
  field,
  inputRef,
  kind,
  label,
  numericFields,
  onAfterLast,
  onChangeText,
  onFocusField,
  set,
  value,
}: {
  current: StrengthFieldRef;
  exerciseName: string;
  field: StrengthNumericField;
  inputRef: ReturnType<typeof useInputRegistry>["ref"];
  kind: "decimal" | "number";
  label: string;
  numericFields: StrengthFieldRef[];
  onAfterLast?: () => void;
  onChangeText: (value: string) => void;
  onFocusField: (target: StrengthFieldRef | null, fallback?: () => void) => void;
  set: DetailedSetDraft;
  value: string;
}) {
  const next = nextStrengthField(numericFields, current);
  const previous = prevStrengthField(numericFields, current);
  const last: ReturnKeyType = next ? "next" : "done";
  return (
    <NumberField
      accessory={{
        context: strengthAccessoryContext({
          exerciseIndex: current.exerciseIndex,
          exerciseName,
          field,
          setIndex: current.setIndex,
        }),
        onDown: next ? () => onFocusField(next) : undefined,
        onUp: previous ? () => onFocusField(previous) : undefined,
      }}
      accessibilityLabel={label}
      containerStyle={field === "reps" ? styles.repsColumn : styles.loadColumn}
      kind={kind}
      onChangeText={onChangeText}
      placeholder={field === "reps" ? "5" : "160"}
      ref={inputRef(strengthFieldKey(set.id, field))}
      style={styles.setInput}
      value={value}
      {...fieldChainProps({
        count: next ? 2 : 1,
        index: 0,
        last,
        onAdvance: () => onFocusField(next),
        onFinish: onAfterLast,
      })}
    />
  );
}

function SetsStepper({
  count,
  onAdd,
  onRemove,
}: {
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>Sets</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel="Remove set"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRemoveSet(count) }}
          disabled={!canRemoveSet(count)}
          onPress={onRemove}
          style={(state) => [styles.stepperHit, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
        >
          <Text style={[styles.stepperGlyph, !canRemoveSet(count) && styles.stepperDisabled]}>-</Text>
        </Pressable>
        <Text accessibilityLabel={`${count} sets`} style={styles.stepperValue}>{count}</Text>
        <Pressable
          accessibilityLabel="Add set"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAddSet(count) }}
          disabled={!canAddSet(count)}
          onPress={onAdd}
          style={(state) => [styles.stepperHit, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
        >
          <Text style={[styles.stepperGlyph, !canAddSet(count) && styles.stepperDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SwipeableSetRow({
  accessibilityActions,
  accessibilityHint,
  accessibilityLabel,
  canDelete,
  children,
  onAccessibilityAction,
  onDelete,
}: {
  accessibilityActions?: { name: string; label?: string }[];
  accessibilityHint?: string;
  accessibilityLabel: string;
  canDelete: boolean;
  children: ReactNode;
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const dragX = useRef(0);
  const rowWidth = useRef(320);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const canDeleteRef = useRef(canDelete);
  canDeleteRef.current = canDelete;

  const close = useCallback(() => {
    dragX.current = 0;
    Animated.spring(translateX, { bounciness: 0, toValue: 0, useNativeDriver: true }).start();
  }, [translateX]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (!canDeleteRef.current) return false;
      return Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25 && gesture.dx < 0;
    },
    onPanResponderMove: (_, gesture) => {
      const next = clampSetRowTranslate(gesture.dx, rowWidth.current);
      dragX.current = next;
      translateX.setValue(next);
    },
    onPanResponderRelease: (_, gesture) => {
      const action = setRowSwipeRelease(dragX.current, gesture.vx);
      if (action === "delete") {
        Animated.timing(translateX, {
          duration: 160,
          toValue: -Math.max(rowWidth.current, setDeleteRevealWidth),
          useNativeDriver: true,
        }).start(() => onDeleteRef.current());
        return;
      }
      if (action === "reveal") {
        dragX.current = -setDeleteRevealWidth;
        Animated.spring(translateX, {
          bounciness: 0,
          toValue: -setDeleteRevealWidth,
          useNativeDriver: true,
        }).start();
        return;
      }
      close();
    },
    onPanResponderTerminate: () => close(),
  })).current;

  return (
    <View
      accessibilityActions={accessibilityActions}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={(event) => {
        rowWidth.current = event.nativeEvent.layout.width;
      }}
      style={styles.swipeHost}
    >
      <View pointerEvents="box-none" style={styles.deleteLane}>
        <Pressable
          accessibilityLabel="Delete set"
          accessibilityRole="button"
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}
        >
          <Text style={styles.deleteActionLabel}>Delete</Text>
        </Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={[styles.swipeFront, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

function LastTimeRow({
  kind,
  label,
  onUse,
  onView,
}: {
  kind: "uniform" | "mixed";
  label: string;
  onUse: () => void;
  onView?: () => void;
}) {
  const copy = kind === "mixed" ? `${label} · View` : label;
  return (
    <View style={styles.lastTimeRow}>
      <Pressable
        accessibilityHint={onView ? "Shows last session sets" : undefined}
        accessibilityLabel={copy}
        accessibilityRole={onView ? "button" : "text"}
        disabled={!onView}
        onPress={onView}
        style={(state) => [
          styles.lastTimeLabelHit,
          onView && state.pressed && styles.pressed,
          onView ? webFocusRing(pressableFocused(state)) : null,
        ]}
      >
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.lastTimeLabel}>{copy}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Use last session"
        accessibilityRole="button"
        onPress={onUse}
        style={(state) => [
          styles.usePill,
          state.pressed && styles.usePillPressed,
          webFocusRing(pressableFocused(state)),
        ]}
      >
        <Text style={styles.usePillLabel}>Use</Text>
      </Pressable>
    </View>
  );
}

function SetsHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.setsHint}>
      <Text style={styles.setsHintCopy}>{setsHintCopy}</Text>
      <Pressable
        accessibilityLabel={setsHintGotIt}
        accessibilityRole="button"
        onPress={onDismiss}
        style={(state) => [styles.setsHintGotIt, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.setsHintGotItLabel}>{setsHintGotIt}</Text>
      </Pressable>
    </View>
  );
}

function ReplaceSetsDialog({
  onCancel,
  onReplace,
  visible,
}: {
  onCancel: () => void;
  onReplace: () => void;
  visible: boolean;
}) {
  return (
    <Dialog
      closeLabel="Cancel"
      maxWidth={replaceDialogMaxWidth}
      onDismiss={onCancel}
      padding={spacing.xl}
      visible={visible}
    >
      <View style={styles.dialogCloseRow}>
        <RoundIconButton accessibilityLabel="Cancel" kind="close" onPress={onCancel} />
      </View>
      <Text style={styles.dialogTitle}>{replaceSetsTitle}</Text>
      <Text style={styles.dialogBody}>{replaceSetsBody}</Text>
      <View style={styles.dialogActions}>
        <View style={styles.dialogAction}>
          <Button onPress={onCancel} style={styles.dialogButton} variant="tonal">Cancel</Button>
        </View>
        <View style={styles.dialogAction}>
          <Button onPress={onReplace} style={styles.dialogButton}>Replace</Button>
        </View>
      </View>
    </Dialog>
  );
}

function LastSessionViewDialog({
  loadUnit,
  name,
  onDismiss,
  sets,
  visible,
}: {
  loadUnit: LoadUnit;
  name: string;
  onDismiss: () => void;
  sets: MovementLastSession["sets"];
  visible: boolean;
}) {
  const rows = lastSessionViewRows(sets, loadUnit);
  return (
    <Dialog
      closeLabel="Close last session"
      maxWidth={replaceDialogMaxWidth}
      onDismiss={onDismiss}
      padding={spacing.xl}
      visible={visible}
    >
      <View style={styles.dialogCloseRow}>
        <RoundIconButton accessibilityLabel="Close last session" kind="close" onPress={onDismiss} />
      </View>
      <Text style={styles.dialogTitle}>{name}</Text>
      <View style={styles.tableHeader} accessibilityElementsHidden>
        <Text style={[styles.tableHeading, styles.setIndex]}>Set</Text>
        <Text style={[styles.tableHeading, styles.repsColumn]}>Reps</Text>
        <Text style={[styles.tableHeading, styles.loadColumn]}>Weight ({loadUnit})</Text>
      </View>
      {rows.map((set, setIndex) => (
        <View key={`${set.id}-${setIndex}`} style={styles.viewSetRow}>
          <Text style={styles.setIndexLabel}>{setIndex + 1}</Text>
          <Text style={[styles.viewSetValue, styles.repsColumn]}>{set.reps || "–"}</Text>
          <Text style={[styles.viewSetValue, styles.loadColumn]}>{set.load || "–"}</Text>
        </View>
      ))}
    </Dialog>
  );
}

export function LastTimeUndoToast({
  onClear,
  toast,
}: {
  onClear: () => void;
  toast: UseUndoToast | null;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const arm = useCallback((ms: number) => {
    clearTimer();
    if (!toastRef.current || ms <= 0) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      onClear();
    }, ms);
  }, [onClear]);

  useEffect(() => {
    if (!toast) {
      clearTimer();
      return;
    }
    deadline.current = Date.now() + useUndoToastMs;
    arm(useUndoToastMs);
    return clearTimer;
  }, [arm, toast]);

  if (!toast) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      onAccessibilityTap={() => {
        clearTimer();
      }}
      style={styles.useUndoToast}
    >
      <Text style={styles.useUndoMessage}>{toast.message}</Text>
      <Pressable
        accessibilityLabel="Undo"
        accessibilityRole="button"
        onBlur={() => arm(Math.max(0, deadline.current - Date.now()))}
        onFocus={clearTimer}
        onPress={() => {
          clearTimer();
          toast.restore();
          onClear();
        }}
        style={(state) => [styles.useUndoAction, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.useUndoActionLabel}>Undo</Text>
      </Pressable>
    </View>
  );
}

function useLastMovementSession(
  movementId: string | null,
  movementName: string,
  excludeSessionId?: string | null,
) {
  const [lastSession, setLastSession] = useState<MovementLastSession | null>(null);

  useEffect(() => {
    const query = lastSessionQuery({ excludeSessionId, movementId, movementName });
    if (!query) {
      setLastSession(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLastSession(null);
    void loadLastMovementSession(query, controller.signal).then((session) => {
      if (!cancelled) setLastSession(session);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [excludeSessionId, movementId, movementName]);

  return lastSession;
}

async function loadLastMovementSession(query: URLSearchParams, signal: AbortSignal) {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const response = await fetch(`${apiUrl}${lastSessionPath}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    signal,
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as { lastSession?: MovementLastSession | null } | null;
  return lastSessionFromResponse(body);
}

const setInputText = {
  fontFamily: fonts.bold,
  fontSize: type.section.fontSize,
  lineHeight: type.section.lineHeight,
  textAlign: "center" as const,
};

const styles = StyleSheet.create({
  unitHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: size.hit,
  },
  summaryRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: setRowPitch,
    paddingHorizontal: spacing.md,
  },
  summaryPressed: {
    backgroundColor: colors.selection,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryName: {
    color: colors.ink,
    fontFamily: fonts.extrabold,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  summaryMeta: {
    color: colors.muted,
    ...type.label,
  },
  exerciseCard: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  exerciseHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  exerciseTitleBlock: {
    flex: 1,
  },
  exerciseNameHit: {
    justifyContent: "center",
    minHeight: size.hit,
  },
  exerciseName: {
    color: colors.ink,
    fontFamily: fonts.extrabold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
  },
  exerciseMeta: {
    color: colors.muted,
    ...type.label,
  },
  lastTimeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: lastTimeUseHeight,
  },
  lastTimeLabelHit: {
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    minHeight: lastTimeUseHeight,
  },
  lastTimeLabel: {
    color: colors.muted,
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  setsHint: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    height: setsHintHeight,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  setsHintCopy: {
    color: colors.brandPressed,
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
    paddingRight: spacing.sm,
  },
  setsHintGotIt: {
    alignItems: "center",
    flexShrink: 0,
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  setsHintGotItLabel: {
    color: colors.brandPressed,
    fontFamily: fonts.bold,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
  },
  dialogCloseRow: {
    marginBottom: spacing.xs,
    marginLeft: -spacing.sm,
    marginTop: -spacing.sm,
  },
  dialogTitle: {
    color: colors.ink,
    ...type.title,
  },
  dialogBody: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  dialogActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  dialogAction: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  dialogButton: {
    height: size.primary,
    minHeight: size.primary,
    width: "100%",
  },
  viewSetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: setRowPitch,
  },
  viewSetValue: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
    textAlign: "center",
  },
  useUndoToast: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.sm,
    height: size.primary,
    paddingHorizontal: spacing.md,
  },
  useUndoMessage: {
    color: colors.surface,
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  useUndoAction: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    width: useUndoActionWidth,
  },
  useUndoActionLabel: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  usePill: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderColor: lastTimeUseBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexShrink: 0,
    height: lastTimeUseHeight,
    justifyContent: "center",
    width: lastTimeUseWidth,
  },
  usePillPressed: {
    backgroundColor: colors.selection,
  },
  usePillLabel: {
    color: colors.brandPressed,
    fontFamily: fonts.extrabold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  tableHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: setTableHeaderHeight,
  },
  tableHeading: {
    color: colors.subtle,
    fontFamily: fonts.extrabold,
    fontSize: type.label.fontSize,
    letterSpacing: setTableHeaderLetterSpacing,
    lineHeight: type.label.lineHeight,
    textTransform: "uppercase",
  },
  setRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: setRowPitch,
  },
  setIndex: {
    textAlign: "center",
    width: setIndexWidth,
  },
  setIndexLabel: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
    textAlign: "center",
    width: setIndexWidth,
  },
  repsColumn: {
    flexGrow: setRepsFlex,
    flexShrink: 1,
    flexBasis: 0,
  },
  loadColumn: {
    flexGrow: setLoadFlex,
    flexShrink: 1,
    flexBasis: 0,
  },
  setInput: setInputText,
  stepperRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  stepperLabel: {
    color: colors.inkSoft,
    fontFamily: fonts.semibold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    height: size.hit,
    width: setsStepperWidth,
  },
  stepperHit: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  stepperValue: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
    textAlign: "center",
  },
  stepperGlyph: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
  },
  stepperDisabled: {
    color: colors.disabledText,
  },
  addExercise: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: size.control,
  },
  addExercisePressed: {
    backgroundColor: colors.selection,
  },
  addExerciseLabel: {
    color: colors.brandPressed,
    fontFamily: fonts.extrabold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  undoToast: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: size.hit,
    paddingHorizontal: spacing.md,
  },
  undoMessage: {
    color: colors.ink,
    flex: 1,
    ...type.bodySmall,
  },
  undoAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: size.hit,
    paddingHorizontal: spacing.sm,
  },
  undoActionLabel: {
    color: colors.brandPressed,
    fontFamily: fonts.extrabold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  swipeHost: {
    overflow: "hidden",
  },
  deleteLane: {
    ...StyleSheet.absoluteFill,
    alignItems: "stretch",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  deleteAction: {
    alignItems: "center",
    backgroundColor: colors.danger,
    justifyContent: "center",
    minHeight: size.hit,
    width: setDeleteRevealWidth,
  },
  deleteActionPressed: {
    backgroundColor: colors.brandPressed,
  },
  deleteActionLabel: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  swipeFront: {
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
