import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { WorkoutFormat } from "@repin/types";

import { Button, ContentOptionsMenu } from "./components";
import { WorkoutUnitToggle } from "./detailed-workout-exercises";
import { Dialog } from "./dialog";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { ChoiceTile, FieldLabel, NumberField, Picker } from "./form-fields";
import { formSpacing, helperText } from "./form-field-state";
import {
  addMovementLabel,
  amrapLengthHelper,
  amrapScoreHelper,
  cappedRepsHelper,
  clearedFormatDraft,
  emomIntervalHelper,
  emomIntervalOptions,
  emomLengthHelper,
  emomPartialWarning,
  emomSlotLabel,
  emptyWeightPlaceholder,
  ffAccessoryContext,
  ffExerciseRowHeight,
  ffExercisesFromPicker,
  ffFieldKey,
  ffNumericFields,
  ffQtyFieldWidth,
  ffQtyKind,
  ffQtyUnits,
  ffUnitPickerWidth,
  finishTimeOverCapMessage,
  formatGridFlexBasis,
  formatGridGap,
  formatLabel,
  formatSwitchPrompt,
  forTimeOptionalHelper,
  functionalFormatOptions,
  hasFilledScore,
  hasTimeCap,
  nextFfField,
  prevFfField,
  roundsCountHelper,
  roundsSameRepsHelper,
  timeCapPlaceholder,
  workoutListHeading,
  type EmomIntervalMinutes,
  type FfExerciseDraft,
  type FfFieldRef,
  type FunctionalFormatDraft,
  type LoadUnit,
} from "./functional-format-state";
import { Icon } from "./icons";
import { fieldChainProps } from "./keyboard";
import { useInputRegistry } from "./keyboard-focus";
import { MovementPicker } from "./movement-picker";
import { pickerMovementFromDraft, type PickerMovement } from "./movement-picker-state";
import { SegmentedControl } from "./primitives";
import { WorkoutTimeInput } from "./quick-log-results";
import { BottomSheet, SheetRow } from "./sheet";
import { moveItem } from "./strength-form-state";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import { CardHeading } from "./workout-form-frame";

export function FunctionalFormatSetup({
  draft,
  onChange,
}: {
  draft: FunctionalFormatDraft;
  onChange: (draft: FunctionalFormatDraft) => void;
}) {
  const [pending, setPending] = useState<WorkoutFormat | null>(null);
  const prompt = pending && draft.type ? formatSwitchPrompt(draft.type, pending) : null;

  const applyFormat = useCallback((next: WorkoutFormat) => {
    onChange(clearedFormatDraft(next));
  }, [onChange]);

  const selectFormat = (next: WorkoutFormat) => {
    if (next === draft.type) return;
    if (draft.type && hasFilledScore(draft)) {
      setPending(next);
      return;
    }
    applyFormat(next);
  };

  const update = (change: Partial<FunctionalFormatDraft>) => onChange({ ...draft, ...change });
  const emomHelper = draft.type === "emom"
    ? emomLengthHelper(draft.lengthMinutes, draft.intervalMinutes)
    : null;

  return (
    <View style={styles.section}>
      <FieldLabel label="Format" />
      <View accessibilityLabel="Format" accessibilityRole="radiogroup" style={styles.formatGrid}>
        {functionalFormatOptions.map((option) => (
          <ChoiceTile
            checkSide="start"
            key={option.value}
            label={option.label}
            onPress={() => selectFormat(option.value)}
            selected={draft.type === option.value}
            style={styles.formatTile}
          />
        ))}
      </View>

      {draft.type === "amrap" ? (
        <NumberField
          containerStyle={[styles.followField, styles.compactField]}
          hint={amrapLengthHelper}
          kind="number"
          label="Workout length"
          onChangeText={(lengthMinutes) => update({ lengthMinutes })}
          placeholder="12"
          suffix="min"
          value={draft.lengthMinutes}
        />
      ) : null}

      {draft.type === "for_time" ? (
        <View style={styles.followField}>
          <View style={styles.pairRow}>
            <NumberField
              containerStyle={styles.pairField}
              kind="number"
              label="Rounds"
              onChangeText={(rounds) => update({ rounds })}
              optional
              placeholder="1"
              suffix="rounds"
              value={draft.rounds}
            />
            <NumberField
              containerStyle={styles.pairField}
              kind="number"
              label="Time cap"
              onChangeText={(timeCapMinutes) => update({ timeCapMinutes })}
              optional
              placeholder={timeCapPlaceholder}
              suffix={draft.timeCapMinutes.trim() ? "min" : undefined}
              value={draft.timeCapMinutes}
            />
          </View>
          <Text style={styles.helper}>{forTimeOptionalHelper}</Text>
        </View>
      ) : null}

      {draft.type === "emom" ? (
        <View style={styles.followField}>
          <FieldLabel label="Every" />
          <View accessibilityLabel="Every" accessibilityRole="radiogroup" style={styles.intervalRow}>
            {emomIntervalOptions.map((option) => (
              <ChoiceTile
                checkSide="start"
                key={option.value}
                label={option.label}
                onPress={() => update({ intervalMinutes: option.value })}
                selected={draft.intervalMinutes === option.value}
                style={styles.intervalTile}
              />
            ))}
          </View>
          <NumberField
            containerStyle={[styles.followField, styles.compactField]}
            kind="number"
            label="Workout length"
            onChangeText={(lengthMinutes) => update({ lengthMinutes })}
            placeholder="12"
            suffix="min"
            value={draft.lengthMinutes}
          />
          {emomHelper ? <Text style={styles.helper}>{emomHelper.text}</Text> : null}
          {emomHelper?.partial ? <Text style={styles.helper}>{emomPartialWarning}</Text> : null}
        </View>
      ) : null}

      {draft.type === "rounds" ? (
        <NumberField
          containerStyle={[styles.followField, styles.compactField]}
          hint={roundsCountHelper}
          kind="number"
          label="Rounds"
          onChangeText={(rounds) => update({ rounds })}
          placeholder="5"
          suffix="rounds"
          value={draft.rounds}
        />
      ) : null}

      <Dialog
        closeLabel="Keep this format"
        onDismiss={() => setPending(null)}
        visible={Boolean(prompt)}
      >
        <Text style={styles.dialogTitle}>{prompt?.title}</Text>
        <Text style={styles.dialogMessage}>{prompt?.message}</Text>
        <Button
          onPress={() => {
            if (pending) applyFormat(pending);
            setPending(null);
          }}
        >
          Switch
        </Button>
        <Button onPress={() => setPending(null)} variant="secondary">
          {draft.type ? `Keep ${formatLabel(draft.type)}` : "Keep format"}
        </Button>
      </Dialog>
    </View>
  );
}

export function FunctionalWorkoutFields({
  exercises,
  formatType,
  intervalMinutes = 1,
  loadUnit,
  onAfterLast,
  onChange,
  onLoadUnitChange,
}: {
  exercises: FfExerciseDraft[];
  formatType: WorkoutFormat;
  intervalMinutes?: EmomIntervalMinutes;
  loadUnit: LoadUnit;
  onAfterLast?: () => void;
  onChange: (exercises: FfExerciseDraft[]) => void;
  onLoadUnitChange: (unit: LoadUnit) => void;
}) {
  const { focus, ref } = useInputRegistry();
  const [picker, setPicker] = useState<{ exerciseId?: string } | null>(null);
  const numericFields = ffNumericFields(exercises);
  const helper = formatType === "emom"
    ? emomIntervalHelper
    : formatType === "rounds"
      ? roundsSameRepsHelper
      : null;

  const confirmPicker = useCallback((selections: PickerMovement[]) => {
    onChange(ffExercisesFromPicker(exercises, selections, picker?.exerciseId));
    setPicker(null);
  }, [exercises, onChange, picker]);

  const focusField = useCallback((target: FfFieldRef | null, fallback?: () => void) => {
    if (!target) {
      fallback?.();
      return;
    }
    const exercise = exercises[target.exerciseIndex];
    if (!exercise) {
      fallback?.();
      return;
    }
    focus(ffFieldKey(exercise.id, target.field));
  }, [exercises, focus]);

  return (
    <View>
      <CardHeading trailing={<WorkoutUnitToggle onChange={onLoadUnitChange} value={loadUnit} />}>
        {workoutListHeading(formatType)}
      </CardHeading>
      {helper ? <Text style={styles.cardHelper}>{helper}</Text> : null}
      {exercises.map((exercise, index) => (
        <View key={exercise.id}>
          {formatType === "emom" ? (
            <Text style={styles.slotLabel}>
              {emomSlotLabel(index, exercises.length, intervalMinutes)}
            </Text>
          ) : null}
          <FfExerciseRow
            canMoveDown={index < exercises.length - 1}
            canMoveUp={index > 0}
            exercise={exercise}
            index={index}
            inputRef={ref}
            loadUnit={loadUnit}
            numericFields={numericFields}
            onAfterLast={onAfterLast}
            onChange={(next) => onChange(exercises.map((item) => item.id === exercise.id ? next : item))}
            onFocusField={focusField}
            onMove={(direction) => onChange(moveItem(exercises, index, direction))}
            onPickName={() => setPicker({ exerciseId: exercise.id })}
            onRemove={() => onChange(exercises.filter((item) => item.id !== exercise.id))}
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setPicker({})}
        style={(state) => [styles.addExercise, state.pressed && styles.addExercisePressed, webFocusRing(pressableFocused(state))]}
      >
        <Icon color={colors.brandPressed} name="plus" size={size.icon.sm} />
        <Text style={styles.addExerciseLabel}>{addMovementLabel(formatType)}</Text>
      </Pressable>
      <MovementPicker
        initialSelection={picker?.exerciseId
          ? pickerSelectionFor(exercises, picker.exerciseId)
          : []}
        onConfirm={confirmPicker}
        onDismiss={() => setPicker(null)}
        visible={picker !== null}
      />
    </View>
  );
}

export function FunctionalScoreFields({
  draft,
  onChange,
}: {
  draft: FunctionalFormatDraft;
  onChange: (draft: FunctionalFormatDraft) => void;
}) {
  const update = (change: Partial<FunctionalFormatDraft>) => onChange({ ...draft, ...change });
  const cap = hasTimeCap(draft);
  const finishError = draft.type === "for_time" && cap && draft.finished && (draft.finishMinutes.trim() || draft.finishSeconds.trim())
    ? finishOverCapError(draft)
    : null;

  if (draft.type === "amrap") {
    return (
      <View>
        <CardHeading>Score</CardHeading>
        <View style={styles.pairRow}>
          <NumberField
            containerStyle={styles.pairField}
            kind="number"
            label="Rounds"
            onChangeText={(scoreRounds) => update({ scoreRounds })}
            placeholder="7"
            suffix="rounds"
            value={draft.scoreRounds}
          />
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.scorePlusWrap}>
            <Text style={styles.scorePlus}>+</Text>
          </View>
          <NumberField
            containerStyle={styles.pairField}
            kind="number"
            label="Extra reps"
            onChangeText={(scoreReps) => update({ scoreReps })}
            optional
            placeholder="0"
            suffix="reps"
            value={draft.scoreReps}
          />
        </View>
        <Text style={styles.helper}>{amrapScoreHelper}</Text>
      </View>
    );
  }

  if (draft.type === "for_time") {
    return (
      <View>
        <CardHeading>Result</CardHeading>
        {cap ? (
          <SegmentedControl
            accessibilityLabel="Result"
            onChange={(finished) => {
              if (finished == null) return;
              update({ finished: finished === "finished" });
            }}
            options={[
              { label: "Finished", value: "finished" },
              { label: "Hit the cap", value: "capped" },
            ]}
            style={styles.segment}
            value={draft.finished ? "finished" : "capped"}
          />
        ) : null}
        {cap && !draft.finished ? (
          <NumberField
            containerStyle={styles.followField}
            hint={cappedRepsHelper(draft.timeCapMinutes)}
            kind="number"
            label="Reps completed"
            onChangeText={(cappedReps) => update({ cappedReps })}
            placeholder="142"
            suffix="reps"
            value={draft.cappedReps}
          />
        ) : (
          <View style={cap ? styles.followField : undefined}>
            <FieldLabel label="Finish time" />
            <WorkoutTimeInput
              minutes={draft.finishMinutes}
              onMinutesChange={(finishMinutes) => update({ finishMinutes })}
              onSecondsChange={(finishSeconds) => update({ finishSeconds })}
              seconds={draft.finishSeconds}
            />
            {finishError ? (
              <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
                {finishError}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  if (draft.type === "rounds") {
    return (
      <View>
        <CardHeading>Result</CardHeading>
        <FieldLabel label="Total time" optional />
        <WorkoutTimeInput
          minutes={draft.totalMinutes}
          onMinutesChange={(totalMinutes) => update({ totalMinutes })}
          onSecondsChange={(totalSeconds) => update({ totalSeconds })}
          seconds={draft.totalSeconds}
        />
      </View>
    );
  }

  return null;
}

function finishOverCapError(draft: FunctionalFormatDraft) {
  const message = finishTimeOverCapMessage(draft.timeCapMinutes);
  const capSeconds = Number(draft.timeCapMinutes.trim()) * 60;
  const finishSeconds = Number(draft.finishMinutes.trim() || 0) * 60 + Number(draft.finishSeconds.trim() || 0);
  if (!Number.isFinite(capSeconds) || capSeconds <= 0) return null;
  if (!Number.isFinite(finishSeconds) || finishSeconds <= 0) return null;
  return finishSeconds > capSeconds ? message : null;
}

function pickerSelectionFor(exercises: FfExerciseDraft[], exerciseId: string): PickerMovement[] {
  const exercise = exercises.find((item) => item.id === exerciseId);
  if (!exercise?.movementName.trim()) return [];
  return [pickerMovementFromDraft(exercise)];
}

function FfExerciseRow({
  canMoveDown,
  canMoveUp,
  exercise,
  index,
  inputRef,
  loadUnit,
  numericFields,
  onAfterLast,
  onChange,
  onFocusField,
  onMove,
  onPickName,
  onRemove,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  exercise: FfExerciseDraft;
  index: number;
  inputRef: ReturnType<typeof useInputRegistry>["ref"];
  loadUnit: LoadUnit;
  numericFields: FfFieldRef[];
  onAfterLast?: () => void;
  onChange: (exercise: FfExerciseDraft) => void;
  onFocusField: (target: FfFieldRef | null, fallback?: () => void) => void;
  onMove: (direction: -1 | 1) => void;
  onPickName: () => void;
  onRemove: () => void;
}) {
  const name = exercise.movementName.trim() || `Exercise ${index + 1}`;
  const [unitOpen, setUnitOpen] = useState(false);
  const qtyRef: FfFieldRef = { exerciseIndex: index, field: "qty" };
  const loadRef: FfFieldRef = { exerciseIndex: index, field: "load" };
  const nextQty = nextFfField(numericFields, qtyRef);
  const nextLoad = nextFfField(numericFields, loadRef);
  const prevQty = prevFfField(numericFields, qtyRef);
  const prevLoad = prevFfField(numericFields, loadRef);

  return (
    <View style={styles.ffRow}>
      <View style={styles.ffHeader}>
        <Pressable
          accessibilityHint="Opens the movement picker"
          accessibilityLabel={`${name}, change exercise`}
          accessibilityRole="button"
          onPress={onPickName}
          style={(state) => [styles.ffNameHit, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
        >
          <Text numberOfLines={1} style={styles.ffName}>{name}</Text>
        </Pressable>
        <ContentOptionsMenu
          accessibilityLabel={`${name} options`}
          items={[
            ...(canMoveUp ? [{ label: "Move up", onPress: () => onMove(-1) }] : []),
            ...(canMoveDown ? [{ label: "Move down", onPress: () => onMove(1) }] : []),
            { danger: true, icon: "trash" as const, label: "Delete exercise", onPress: onRemove },
          ]}
        />
      </View>
      <View style={styles.ffFields}>
        <NumberField
          accessory={{
            context: ffAccessoryContext({ exerciseIndex: index, exerciseName: exercise.movementName, field: "qty" }),
            onDown: nextQty ? () => onFocusField(nextQty) : undefined,
            onUp: prevQty ? () => onFocusField(prevQty) : undefined,
          }}
          accessibilityLabel="Quantity"
          containerStyle={styles.qtyField}
          kind={ffQtyKind(exercise.unit)}
          onChangeText={(qty) => onChange({ ...exercise, qty })}
          placeholder="10"
          ref={inputRef(ffFieldKey(exercise.id, "qty"))}
          value={exercise.qty}
          {...fieldChainProps({
            count: nextQty ? 2 : 1,
            index: 0,
            onAdvance: () => onFocusField(nextQty),
            onFinish: onAfterLast,
          })}
        />
        <Picker
          accessibilityHint="Opens quantity units"
          accessibilityLabel={`Unit, ${exercise.unit}`}
          containerStyle={styles.unitField}
          onPress={() => setUnitOpen(true)}
          value={exercise.unit}
        />
        <NumberField
          accessory={{
            context: ffAccessoryContext({ exerciseIndex: index, exerciseName: exercise.movementName, field: "load" }),
            onDown: nextLoad ? () => onFocusField(nextLoad) : undefined,
            onUp: prevLoad ? () => onFocusField(prevLoad) : undefined,
          }}
          accessibilityLabel="Weight"
          containerStyle={styles.loadField}
          kind="decimal"
          onChangeText={(load) => onChange({ ...exercise, load })}
          placeholder={emptyWeightPlaceholder}
          ref={inputRef(ffFieldKey(exercise.id, "load"))}
          suffix={loadUnit}
          value={exercise.load}
          {...fieldChainProps({
            count: nextLoad ? 2 : 1,
            index: 0,
            onAdvance: () => onFocusField(nextLoad),
            onFinish: onAfterLast,
          })}
        />
      </View>
      <BottomSheet
        closeLabel="Close unit options"
        onDismiss={() => setUnitOpen(false)}
        title="Unit"
        visible={unitOpen}
      >
        {(close) => (
          <View>
            {ffQtyUnits.map((unit) => (
              <SheetRow
                key={unit}
                onPress={() => {
                  onChange({ ...exercise, unit });
                  close();
                }}
                selected={exercise.unit === unit}
              >
                <Text style={[styles.unitOption, exercise.unit === unit && styles.unitOptionSelected]}>{unit}</Text>
              </SheetRow>
            ))}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  formatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: formatGridGap,
    marginTop: formSpacing.labelGap,
  },
  formatTile: {
    flexBasis: formatGridFlexBasis,
    flexGrow: 1,
  },
  intervalRow: {
    flexDirection: "row",
    gap: formatGridGap,
    marginTop: formSpacing.labelGap,
  },
  intervalTile: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  followField: {
    marginTop: formSpacing.fieldGap,
  },
  pairRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
  },
  pairField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  compactField: {
    alignSelf: "flex-start",
    minWidth: size.hit * 3,
    width: "48%",
  },
  helper: {
    ...helperText,
    marginTop: formSpacing.helperGap,
  },
  cardHelper: {
    ...helperText,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  slotLabel: {
    color: colors.muted,
    marginTop: spacing.md,
    ...type.label,
  },
  ffRow: {
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: ffExerciseRowHeight,
  },
  ffHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: size.hit,
  },
  ffNameHit: {
    flex: 1,
    justifyContent: "center",
    minHeight: size.hit,
  },
  ffName: {
    color: colors.ink,
    fontFamily: fonts.extrabold,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  ffFields: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  qtyField: {
    width: ffQtyFieldWidth,
  },
  unitField: {
    width: ffUnitPickerWidth,
  },
  loadField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
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
  scorePlusWrap: {
    alignItems: "center",
    height: size.control,
    justifyContent: "center",
    width: spacing.xl,
  },
  scorePlus: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
    textAlign: "center",
  },
  segment: {
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.semibold,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    marginTop: formSpacing.helperGap,
  },
  unitOption: {
    ...type.bodyMedium,
    color: colors.inkSoft,
    flex: 1,
  },
  unitOptionSelected: {
    color: colors.ink,
    fontFamily: fonts.semibold,
  },
  dialogTitle: {
    color: colors.ink,
    ...type.title,
  },
  dialogMessage: {
    color: colors.inkSoft,
    ...type.body,
  },
  pressed: {
    opacity: 0.7,
  },
});
