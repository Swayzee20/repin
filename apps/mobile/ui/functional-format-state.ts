import type {
  ForTimeScore,
  QuickLogMovementInput,
  QuickLogSetInput,
  WorkoutDetailMovement,
  WorkoutDetailSet,
  WorkoutFormat,
  WorkoutFormatDetail,
} from "@repin/types";

import { getDurationSeconds, validateTimeParts } from "../lib/workout-time";
import {
  defaultMeasureForMovement,
  type MovementMeasure,
  type PickerMovement,
} from "./movement-picker-state";
import { draftId } from "./strength-form-state";
import { size, spacing } from "./theme";

export type LoadUnit = "lb" | "kg";
export type FfQtyUnit = "reps" | "cal" | "m" | "km" | "mi" | "sec";
export type EmomIntervalMinutes = 1 | 2 | 3;

export type FfExerciseDraft = {
  defaultMeasure: MovementMeasure;
  equipment: string | null;
  id: string;
  load: string;
  movementId: string | null;
  movementName: string;
  qty: string;
  unit: FfQtyUnit;
};

export type FunctionalFormatDraft = {
  cappedReps: string;
  finishMinutes: string;
  finishSeconds: string;
  finished: boolean;
  intervalMinutes: EmomIntervalMinutes;
  lengthMinutes: string;
  rounds: string;
  scoreReps: string;
  scoreRounds: string;
  timeCapMinutes: string;
  totalMinutes: string;
  totalSeconds: string;
  type: WorkoutFormat | null;
};

export const functionalFormatOptions = [
  { label: "AMRAP", value: "amrap" },
  { label: "For Time", value: "for_time" },
  { label: "EMOM", value: "emom" },
  { label: "Rounds", value: "rounds" },
] as const satisfies readonly { label: string; value: WorkoutFormat }[];

export const emomIntervalOptions = [
  { label: "1 min", value: 1 },
  { label: "2 min", value: 2 },
  { label: "3 min", value: 3 },
] as const satisfies readonly { label: string; value: EmomIntervalMinutes }[];

export const ffQtyUnits = ["reps", "cal", "m", "km", "mi", "sec"] as const satisfies readonly FfQtyUnit[];

export const formatGridGap = spacing.sm;
export const formatGridFlexBasis = "46%";
/** SPEC §3.7: name row (44) + fields (48) + 20pt gap = 112. */
export const ffExerciseRowHeight = size.hit + size.control + spacing.xl;
export const ffQtyFieldWidth = 72;
export const ffUnitPickerWidth = 92;
export const maxFfMovements = 20;
export const minFormatMinutes = 1;
export const maxFormatMinutes = 180;

export const amrapLengthHelper = "How long the AMRAP ran, e.g. 20 min";
export const amrapScoreHelper = "Full rounds, plus reps into the next round";
export const amrapZeroNote = "0 rounds is valid. Empty extra reps = 0.";
export const amrapLengthRequired = "Add the workout length";
export const amrapRoundsRequired = "Add the rounds you completed.";
export const forTimeOptionalHelper = "Both optional. Add a cap to log reps if you didn't finish.";
export const roundsCountHelper = "How many rounds you did";
export const roundsSameRepsHelper = "Same reps every round";
export const emomIntervalHelper = "One movement per interval. They repeat in order.";
export const emomPartialWarning = "Last interval is partial";
export const chooseFormatReason = "Choose a format.";
export const addExerciseReason = "Add an exercise.";
export const emptyWeightPlaceholder = "–";
export const timeCapPlaceholder = "No cap";
export const liveResultHeight = spacing.huge;

export const emptyFunctionalFormat: FunctionalFormatDraft = {
  cappedReps: "",
  finishMinutes: "",
  finishSeconds: "",
  finished: true,
  intervalMinutes: 1,
  lengthMinutes: "",
  rounds: "",
  scoreReps: "",
  scoreRounds: "",
  timeCapMinutes: "",
  totalMinutes: "",
  totalSeconds: "",
  type: null,
};

export function formatLabel(format: WorkoutFormat) {
  return functionalFormatOptions.find((option) => option.value === format)?.label ?? format;
}

export function workoutListHeading(format: WorkoutFormat) {
  if (format === "for_time") return "Workout";
  if (format === "emom") return "Each interval";
  return "Each round";
}

export function addMovementLabel(format: WorkoutFormat) {
  return format === "emom" ? "Add movement" : "Add exercise";
}

export function measureToUnit(measure: MovementMeasure): FfQtyUnit {
  return measure;
}

export function clearedFormatDraft(type: WorkoutFormat | null): FunctionalFormatDraft {
  return { ...emptyFunctionalFormat, type };
}

export function hasFilledScore(draft: FunctionalFormatDraft) {
  switch (draft.type) {
    case "amrap":
      return Boolean(draft.scoreRounds.trim() || draft.scoreReps.trim());
    case "for_time":
      return Boolean(draft.finishMinutes.trim() || draft.finishSeconds.trim() || draft.cappedReps.trim());
    case "rounds":
      return Boolean(draft.totalMinutes.trim() || draft.totalSeconds.trim());
    default:
      return false;
  }
}

export function formatSwitchPrompt(from: WorkoutFormat, to: WorkoutFormat) {
  return {
    message: `Your ${formatLabel(from)} score will be cleared.`,
    title: `Switch to ${formatLabel(to)}?`,
  };
}

export function minutesToSeconds(value: string) {
  const text = value.trim();
  if (!text) return null;
  const minutes = Number(text);
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  return minutes * 60;
}

export function secondsToMinutesField(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return "";
  return String(Math.round(seconds / 60));
}

export function secondsToClock(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function splitSecondsFields(totalSeconds: number | null | undefined) {
  if (totalSeconds == null || totalSeconds <= 0) return { minutes: "", seconds: "" };
  return {
    minutes: String(Math.floor(totalSeconds / 60)),
    seconds: String(totalSeconds % 60),
  };
}

export function intervalMinutesFromSeconds(seconds: number | null | undefined): EmomIntervalMinutes {
  if (seconds === 120) return 2;
  if (seconds === 180) return 3;
  return 1;
}

export function hasTimeCap(draft: FunctionalFormatDraft) {
  return Boolean(draft.timeCapMinutes.trim());
}

export function formatCapClock(minutes: string) {
  const seconds = minutesToSeconds(minutes);
  return seconds == null ? null : secondsToClock(seconds);
}

export function finishTimeOverCapMessage(minutes: string) {
  const clock = formatCapClock(minutes);
  return clock
    ? `Finish time must be under the ${clock} cap. Edit the time or choose Hit the cap.`
    : "Finish time must be under the cap. Edit the time or choose Hit the cap.";
}

export function finishTimeViolatesCap(finishSeconds: number, capSeconds: number) {
  return !(finishSeconds > 0 && finishSeconds < capSeconds);
}

export function cappedRepsHelper(minutes: string) {
  const clock = formatCapClock(minutes);
  return clock ? `Total reps done before the ${clock} cap` : "Total reps done before the cap";
}

export function emomLengthHelper(lengthMinutes: string, intervalMinutes: EmomIntervalMinutes) {
  const length = Number(lengthMinutes.trim());
  if (!Number.isInteger(length) || length <= 0) return null;
  const intervals = Math.floor(length / intervalMinutes);
  return {
    partial: length % intervalMinutes !== 0,
    text: `${length} min, every ${intervalMinutes} min = ${intervals} ${intervals === 1 ? "interval" : "intervals"}`,
  };
}

export function emomSlotLabel(index: number, slotCount: number, intervalMinutes: EmomIntervalMinutes) {
  const n = index + 1;
  if (intervalMinutes !== 1) return `Interval ${n}`;
  if (slotCount === 2) {
    return n === 1 ? "Minute 1 · odd minutes" : "Minute 2 · even minutes";
  }
  return `Minute ${n}`;
}

function parsePositiveInt(value: string) {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function parseNonNegativeInt(value: string) {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function minutesRangeError(value: string, required: boolean) {
  const text = value.trim();
  if (!text) return required ? amrapLengthRequired : null;
  const minutes = Number(text);
  if (!Number.isInteger(minutes) || minutes < minFormatMinutes || minutes > maxFormatMinutes) {
    return `Workout length must be ${minFormatMinutes}–${maxFormatMinutes} min.`;
  }
  return null;
}

export function hydrateFunctionalFormat(format: WorkoutFormatDetail | null | undefined): FunctionalFormatDraft {
  if (!format) return { ...emptyFunctionalFormat };
  const base = clearedFormatDraft(format.type);
  switch (format.type) {
    case "amrap":
      return {
        ...base,
        lengthMinutes: secondsToMinutesField(format.durationSeconds),
        scoreReps: format.score?.reps ? String(format.score.reps) : "",
        scoreRounds: format.score?.rounds == null ? "" : String(format.score.rounds),
      };
    case "for_time": {
      const finish = format.score?.finished === true ? splitSecondsFields(format.score.timeSeconds) : { minutes: "", seconds: "" };
      return {
        ...base,
        cappedReps: format.score?.finished === false ? String(format.score.reps) : "",
        finishMinutes: finish.minutes,
        finishSeconds: finish.seconds,
        finished: format.score?.finished !== false,
        rounds: format.rounds == null ? "" : String(format.rounds),
        timeCapMinutes: secondsToMinutesField(format.timeCapSeconds),
      };
    }
    case "emom":
      return {
        ...base,
        intervalMinutes: intervalMinutesFromSeconds(format.intervalSeconds),
        lengthMinutes: secondsToMinutesField(format.durationSeconds),
      };
    case "rounds": {
      const total = splitSecondsFields(format.score?.timeSeconds);
      return {
        ...base,
        rounds: String(format.rounds),
        totalMinutes: total.minutes,
        totalSeconds: total.seconds,
      };
    }
  }
}

function unitFromSet(set: WorkoutDetailSet | undefined, fallback: FfQtyUnit): FfQtyUnit {
  if (!set) return fallback;
  if (set.calories != null) return "cal";
  if (set.durationSeconds != null) return "sec";
  if (set.distance != null) {
    if (set.distanceUnit === "km" || set.distanceUnit === "mi" || set.distanceUnit === "m") {
      return set.distanceUnit;
    }
    return "m";
  }
  if (set.reps != null) return "reps";
  return fallback;
}

function qtyFromSet(set: WorkoutDetailSet | undefined, unit: FfQtyUnit) {
  if (!set) return "";
  switch (unit) {
    case "cal":
      return set.calories == null ? "" : String(set.calories);
    case "sec":
      return set.durationSeconds == null ? "" : String(set.durationSeconds);
    case "m":
    case "km":
    case "mi":
      return set.distance == null ? "" : String(set.distance);
    default:
      return set.reps == null ? "" : String(set.reps);
  }
}

export function createFfExercise(
  source?: Partial<Pick<FfExerciseDraft, "defaultMeasure" | "equipment" | "load" | "movementId" | "movementName" | "qty" | "unit">>,
  id = draftId(),
): FfExerciseDraft {
  const movementName = source?.movementName ?? "";
  const movementId = source?.movementId ?? null;
  const defaultMeasure = source?.defaultMeasure ?? defaultMeasureForMovement(movementName, !movementId);
  return {
    defaultMeasure,
    equipment: source?.equipment ?? null,
    id,
    load: source?.load ?? "",
    movementId,
    movementName,
    qty: source?.qty ?? "",
    unit: source?.unit ?? measureToUnit(defaultMeasure),
  };
}

export function hydrateFfExercises(movements: WorkoutDetailMovement[]): FfExerciseDraft[] {
  return movements.map((movement) => {
    const set = movement.sets[0];
    const defaultMeasure = defaultMeasureForMovement(movement.movementName, !movement.movementId);
    const unit = unitFromSet(set, measureToUnit(defaultMeasure));
    return {
      defaultMeasure,
      equipment: null,
      id: movement.id,
      load: set?.load == null ? "" : String(set.load),
      movementId: movement.movementId,
      movementName: movement.movementName,
      qty: qtyFromSet(set, unit),
      unit,
    };
  });
}

export function ffExercisesFromPicker(
  exercises: FfExerciseDraft[],
  selections: PickerMovement[],
  replaceId?: string | null,
) {
  if (!selections.length) return exercises;
  const drafts = selections.map((selection, index) => {
    const keep = replaceId && index === 0
      ? exercises.find((exercise) => exercise.id === replaceId)
      : undefined;
    return createFfExercise({
      defaultMeasure: selection.defaultMeasure,
      equipment: selection.equipment,
      load: keep?.load,
      movementId: selection.movementId,
      movementName: selection.movementName,
      qty: keep?.qty,
      unit: keep?.unit,
    }, keep?.id);
  });
  if (!replaceId) return [...exercises, ...drafts].slice(0, maxFfMovements);
  const index = exercises.findIndex((exercise) => exercise.id === replaceId);
  if (index < 0) return [...exercises, ...drafts].slice(0, maxFfMovements);
  return [...exercises.slice(0, index), ...drafts, ...exercises.slice(index + 1)].slice(0, maxFfMovements);
}

export type FfNumericField = "load" | "qty";

export type FfFieldRef = {
  exerciseIndex: number;
  field: FfNumericField;
};

export function ffNumericFields(exercises: readonly unknown[]) {
  const fields: FfFieldRef[] = [];
  exercises.forEach((_exercise, exerciseIndex) => {
    fields.push({ exerciseIndex, field: "qty" });
    fields.push({ exerciseIndex, field: "load" });
  });
  return fields;
}

export function ffFieldKey(exerciseId: string, field: FfNumericField) {
  return `${exerciseId}:${field}`;
}

export function nextFfField(fields: FfFieldRef[], current: FfFieldRef) {
  const index = fields.findIndex(
    (field) => field.exerciseIndex === current.exerciseIndex && field.field === current.field,
  );
  if (index < 0 || index >= fields.length - 1) return null;
  return fields[index + 1] ?? null;
}

export function prevFfField(fields: FfFieldRef[], current: FfFieldRef) {
  const index = fields.findIndex(
    (field) => field.exerciseIndex === current.exerciseIndex && field.field === current.field,
  );
  if (index <= 0) return null;
  return fields[index - 1] ?? null;
}

export function ffAccessoryContext({
  exerciseIndex,
  exerciseName,
  field,
}: {
  exerciseIndex: number;
  exerciseName: string;
  field: FfNumericField;
}) {
  const name = exerciseName.trim() || `Exercise ${exerciseIndex + 1}`;
  return `${name} · ${field === "qty" ? "Qty" : "Weight"}`;
}

function qtyKind(unit: FfQtyUnit): "decimal" | "number" {
  return unit === "km" || unit === "mi" || unit === "m" ? "decimal" : "number";
}

export function ffQtyKind(unit: FfQtyUnit) {
  return qtyKind(unit);
}

function validateQty(exercise: FfExerciseDraft) {
  const name = exercise.movementName.trim() || "this exercise";
  const text = exercise.qty.trim();
  if (!text) return `Add a quantity for ${name}.`;
  const value = Number(text);
  switch (exercise.unit) {
    case "reps":
      if (!Number.isInteger(value) || value <= 0) return `Enter positive whole-number reps for ${name}.`;
      break;
    case "cal":
      if (!Number.isInteger(value) || value < 0) return `Enter a non-negative calorie count for ${name}.`;
      break;
    case "sec":
      if (!Number.isInteger(value) || value <= 0) return `Enter a positive time in seconds for ${name}.`;
      break;
    default:
      if (!Number.isFinite(value) || value <= 0) return `Distance must be greater than zero for ${name}.`;
  }
  if (exercise.load.trim()) {
    const load = Number(exercise.load);
    if (!Number.isFinite(load) || load < 0) return `Enter a non-negative weight for ${name}.`;
  }
  return null;
}

export function validateFfExercises(exercises: FfExerciseDraft[]) {
  if (!exercises.length) return addExerciseReason;
  if (exercises.length > maxFfMovements) return "A workout can have at most 20 exercises.";
  for (const exercise of exercises) {
    if (!exercise.movementName.trim()) return "Add an exercise name or remove the empty exercise.";
    const issue = validateQty(exercise);
    if (issue) return issue;
  }
  return null;
}

export function functionalFormatDisabledReason(
  draft: FunctionalFormatDraft,
  exercises: FfExerciseDraft[],
  editing: boolean,
) {
  if (!draft.type) return editing ? undefined : chooseFormatReason;
  if (draft.type === "amrap" && !draft.lengthMinutes.trim()) return amrapLengthRequired;
  if (draft.type === "emom" && !draft.lengthMinutes.trim()) return amrapLengthRequired;
  if (draft.type === "rounds" && !draft.rounds.trim()) return "Add how many rounds you did";
  if (!exercises.length) return addExerciseReason;
  if (draft.type === "amrap" && !draft.scoreRounds.trim()) return amrapRoundsRequired;
  const capError = forTimeFinishCapError(draft);
  if (capError) return capError;
  return undefined;
}

export function forTimeFinishCapError(draft: FunctionalFormatDraft) {
  if (draft.type !== "for_time" || !draft.finished || !hasTimeCap(draft)) return null;
  if (!draft.finishMinutes.trim() && !draft.finishSeconds.trim()) return null;
  const timeError = validateTimeParts(draft.finishMinutes, draft.finishSeconds);
  if (timeError) return timeError;
  const finish = getDurationSeconds(draft.finishMinutes, draft.finishSeconds);
  const cap = minutesToSeconds(draft.timeCapMinutes);
  if (finish == null || cap == null) return null;
  if (finishTimeViolatesCap(finish, cap)) return finishTimeOverCapMessage(draft.timeCapMinutes);
  return null;
}

export function validateFunctionalFormat(draft: FunctionalFormatDraft, exercises: FfExerciseDraft[]) {
  if (!draft.type) return chooseFormatReason;

  if (draft.type === "amrap" || draft.type === "emom") {
    const lengthError = minutesRangeError(draft.lengthMinutes, true);
    if (lengthError) return lengthError;
  }

  if (draft.type === "amrap") {
    const rounds = parseNonNegativeInt(draft.scoreRounds);
    if (rounds == null) return amrapRoundsRequired;
    if (draft.scoreReps.trim()) {
      const reps = parseNonNegativeInt(draft.scoreReps);
      if (reps == null) return "Extra reps must be a whole number of 0 or more.";
    }
  }

  if (draft.type === "for_time") {
    if (draft.rounds.trim() && parsePositiveInt(draft.rounds) == null) {
      return "Rounds must be a positive whole number.";
    }
    if (draft.timeCapMinutes.trim()) {
      const capError = minutesRangeError(draft.timeCapMinutes, false);
      if (capError) return capError;
    }
    const capped = hasTimeCap(draft) && !draft.finished;
    if (capped) {
      if (parseNonNegativeInt(draft.cappedReps) == null) return "Add the reps you completed.";
    } else if (draft.finishMinutes.trim() || draft.finishSeconds.trim()) {
      const timeError = validateTimeParts(draft.finishMinutes, draft.finishSeconds);
      if (timeError) return timeError;
      const finish = getDurationSeconds(draft.finishMinutes, draft.finishSeconds);
      const cap = minutesToSeconds(draft.timeCapMinutes);
      if (finish != null && cap != null && finishTimeViolatesCap(finish, cap)) {
        return finishTimeOverCapMessage(draft.timeCapMinutes);
      }
    }
  }

  if (draft.type === "rounds") {
    if (parsePositiveInt(draft.rounds) == null) return "Rounds must be a positive whole number.";
    if (draft.totalMinutes.trim() || draft.totalSeconds.trim()) {
      const timeError = validateTimeParts(draft.totalMinutes, draft.totalSeconds);
      if (timeError) return timeError;
    }
  }

  return validateFfExercises(exercises);
}

function buildFfSet(exercise: FfExerciseDraft, loadUnit: LoadUnit): QuickLogSetInput {
  const qty = Number(exercise.qty);
  const hasQty = exercise.qty.trim() !== "" && Number.isFinite(qty);
  const hasLoad = Boolean(exercise.load.trim());
  const set: QuickLogSetInput = {};
  if (hasLoad) {
    set.load = Number(exercise.load);
    set.loadUnit = loadUnit;
  }
  if (hasQty) {
    switch (exercise.unit) {
      case "reps":
        set.reps = qty;
        break;
      case "cal":
        set.calories = qty;
        break;
      case "sec":
        set.durationSeconds = qty;
        break;
      default:
        set.distance = qty;
        set.distanceUnit = exercise.unit;
        break;
    }
  }
  return set;
}

export function buildFfMovements(
  exercises: FfExerciseDraft[],
  loadUnit: LoadUnit,
): QuickLogMovementInput[] {
  return exercises.map((exercise) => ({
    movementId: exercise.movementId,
    movementName: exercise.movementName.trim(),
    sets: [buildFfSet(exercise, loadUnit)],
  }));
}

export function buildFunctionalFormat(draft: FunctionalFormatDraft): WorkoutFormatDetail | null {
  if (!draft.type) return null;
  switch (draft.type) {
    case "amrap":
      return {
        durationSeconds: minutesToSeconds(draft.lengthMinutes),
        score: {
          reps: parseNonNegativeInt(draft.scoreReps) ?? 0,
          rounds: parseNonNegativeInt(draft.scoreRounds) ?? 0,
        },
        type: "amrap",
      };
    case "for_time": {
      const cap = minutesToSeconds(draft.timeCapMinutes);
      const rounds = parsePositiveInt(draft.rounds);
      const capped = cap != null && !draft.finished;
      let score: ForTimeScore | null = null;
      if (capped) {
        const reps = parseNonNegativeInt(draft.cappedReps);
        if (reps != null) score = { finished: false, reps };
      } else {
        const timeSeconds = getDurationSeconds(draft.finishMinutes, draft.finishSeconds);
        if (timeSeconds != null) score = { finished: true, timeSeconds };
      }
      return {
        rounds,
        score,
        timeCapSeconds: cap,
        type: "for_time",
      };
    }
    case "emom":
      return {
        durationSeconds: minutesToSeconds(draft.lengthMinutes),
        intervalSeconds: draft.intervalMinutes * 60,
        score: null,
        type: "emom",
      };
    case "rounds": {
      const timeSeconds = getDurationSeconds(draft.totalMinutes, draft.totalSeconds);
      return {
        rounds: parsePositiveInt(draft.rounds) ?? 0,
        score: timeSeconds == null ? null : { timeSeconds },
        type: "rounds",
      };
    }
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

function joinSummary(parts: Array<string | null | undefined>) {
  const available = parts.filter((part): part is string => Boolean(part));
  return available.length ? available.join(" · ") : null;
}

export function previewFunctionalFormatSummary(
  draft: FunctionalFormatDraft,
  exercises: FfExerciseDraft[],
) {
  if (!draft.type) return null;
  const named = exercises.filter((exercise) => exercise.movementName.trim());
  switch (draft.type) {
    case "amrap": {
      const minutes = parsePositiveInt(draft.lengthMinutes);
      const label = minutes ? `AMRAP ${minutes}` : "AMRAP";
      const rounds = parseNonNegativeInt(draft.scoreRounds);
      if (rounds == null) return label;
      const reps = parseNonNegativeInt(draft.scoreReps) ?? 0;
      const score = reps === 0
        ? `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"}`
        : `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"} + ${formatNumber(reps)} ${reps === 1 ? "rep" : "reps"}`;
      return joinSummary([label, score]);
    }
    case "for_time": {
      const cap = minutesToSeconds(draft.timeCapMinutes);
      const capped = cap != null && !draft.finished;
      if (capped) {
        const reps = parseNonNegativeInt(draft.cappedReps);
        if (reps != null) {
          return joinSummary(["For Time", `${formatNumber(reps)} ${reps === 1 ? "rep" : "reps"} (capped at ${secondsToClock(cap)})`]);
        }
      } else {
        const time = getDurationSeconds(draft.finishMinutes, draft.finishSeconds);
        if (time != null) return joinSummary(["For Time", secondsToClock(time)]);
      }
      const count = named.length;
      return joinSummary(["For Time", count ? `${count} ${count === 1 ? "movement" : "movements"}` : null]);
    }
    case "emom": {
      const minutes = parsePositiveInt(draft.lengthMinutes);
      const prefix = draft.intervalMinutes === 1 ? "EMOM" : `E${draft.intervalMinutes}MOM`;
      const label = minutes ? `${prefix} ${minutes}` : prefix;
      if (named.length === 1) {
        const movement = named[0];
        const reps = movement?.unit === "reps" ? parsePositiveInt(movement.qty) : null;
        const name = movement?.movementName.trim();
        if (name && reps != null) return joinSummary([label, `${formatNumber(reps)} ${name}`]);
        if (name) return joinSummary([label, name]);
      }
      return joinSummary([
        label,
        named.length ? `${named.length} ${named.length === 1 ? "movement" : "movements"}` : null,
      ]);
    }
    case "rounds": {
      const rounds = parsePositiveInt(draft.rounds);
      const roundsLabel = rounds ? `${formatNumber(rounds)} ${rounds === 1 ? "round" : "rounds"}` : "Rounds";
      const time = getDurationSeconds(draft.totalMinutes, draft.totalSeconds);
      if (time != null) return joinSummary([roundsLabel, secondsToClock(time)]);
      const names = named.map((exercise) => exercise.movementName.trim()).slice(0, 2);
      const remaining = named.length - names.length;
      return joinSummary([
        roundsLabel,
        names.length ? [...names, remaining > 0 ? `+${remaining} more` : null].filter(Boolean).join(" · ") : null,
      ]);
    }
  }
}

function countLabel(value: number, singular: string, plural: string) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

/** Local derived score/summary line. Not stored. Null until required fields are valid. */
export function liveScoreLine(draft: FunctionalFormatDraft) {
  if (draft.type === "amrap") {
    const rounds = parseNonNegativeInt(draft.scoreRounds);
    if (rounds == null) return null;
    if (draft.scoreReps.trim() && parseNonNegativeInt(draft.scoreReps) == null) return null;
    const reps = parseNonNegativeInt(draft.scoreReps) ?? 0;
    if (reps === 0) return countLabel(rounds, "round", "rounds");
    return `${countLabel(rounds, "round", "rounds")} + ${countLabel(reps, "rep", "reps")}`;
  }

  if (draft.type === "for_time") {
    if (forTimeFinishCapError(draft)) return null;
    const cap = minutesToSeconds(draft.timeCapMinutes);
    const capped = cap != null && !draft.finished;
    if (capped) {
      const reps = parseNonNegativeInt(draft.cappedReps);
      if (reps == null) return null;
      return `Capped · ${countLabel(reps, "rep", "reps")}`;
    }
    if (!draft.finishMinutes.trim() && !draft.finishSeconds.trim()) return null;
    if (validateTimeParts(draft.finishMinutes, draft.finishSeconds)) return null;
    const time = getDurationSeconds(draft.finishMinutes, draft.finishSeconds);
    if (time == null || time <= 0) return null;
    return `Finished · ${secondsToClock(time)}`;
  }

  if (draft.type === "emom") {
    const length = parsePositiveInt(draft.lengthMinutes);
    if (length == null) return null;
    return `Every ${draft.intervalMinutes} min for ${length} min`;
  }

  return null;
}
