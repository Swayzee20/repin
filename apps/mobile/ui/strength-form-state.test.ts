import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, fonts, size, spacing, type } from "./theme";
import {
  appendCopiedSet,
  buildDetailedMovements,
  canAddSet,
  canRemoveSet,
  clampSetRowTranslate,
  createDetailedExercise,
  createDetailedSet,
  deletedSetMessage,
  deleteSetAt,
  exercisesFromPickerSelections,
  formatExerciseSummary,
  hydrateWorkoutLoadUnit,
  loadUnitStorageKey,
  maxSets,
  minSets,
  nextStrengthField,
  parseStoredLoadUnit,
  prevStrengthField,
  readStoredLoadUnit,
  removeLastSet,
  restoreSet,
  setDeleteRevealWidth,
  setIndexWidth,
  setLoadFlex,
  setRepsFlex,
  setRowPitch,
  setRowSwipeRelease,
  setsStepperWidth,
  showsAndroidKeyboardAccessory,
  strengthAccessoryContext,
  strengthFieldKey,
  strengthNumericFields,
  undoToastMs,
  writeStoredLoadUnit,
} from "./strength-form-state";
import { catalogFromSummary, customFromName } from "./movement-picker-state";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test("the stepper copies the last row and never locks earlier sets", () => {
  const first = createDetailedSet("s1", { load: "225", reps: "5" });
  const copied = appendCopiedSet([first], "s2");
  assert.equal(copied.length, 2);
  assert.deepEqual(copied[1], { id: "s2", load: "225", reps: "5" });
  assert.deepEqual(copied[0], first);
  copied[0].load = "230";
  assert.equal(copied[1]?.load, "225");
});

test("the stepper stays between 1 and 20 sets", () => {
  const one = [createDetailedSet("s1")];
  assert.equal(canRemoveSet(one.length), false);
  assert.equal(removeLastSet(one), null);
  assert.equal(deleteSetAt(one, 0), null);

  const full = Array.from({ length: maxSets }, (_, index) => createDetailedSet(`s${index}`));
  assert.equal(canAddSet(full.length), false);
  assert.equal(appendCopiedSet(full, "overflow").length, maxSets);
  assert.equal(minSets, 1);
});

test("deleting a middle set can be undone in place", () => {
  const sets = [
    createDetailedSet("s1", { load: "135", reps: "8" }),
    createDetailedSet("s2", { load: "155", reps: "5" }),
    createDetailedSet("s3", { load: "175", reps: "3" }),
  ];
  const deleted = deleteSetAt(sets, 1);
  assert.ok(deleted);
  assert.deepEqual(deleted.sets.map((set) => set.id), ["s1", "s3"]);
  assert.equal(deletedSetMessage(deleted.index + 1), "Set 2 deleted");
  assert.deepEqual(restoreSet(deleted.sets, deleted.removed, deleted.index).map((set) => set.id), ["s1", "s2", "s3"]);
});

test("removing the last set with the stepper is the same undo snapshot", () => {
  const sets = [createDetailedSet("s1"), createDetailedSet("s2", { load: "160", reps: "5" })];
  const removed = removeLastSet(sets);
  assert.ok(removed);
  assert.equal(removed.index, 1);
  assert.equal(removed.removed.id, "s2");
  assert.deepEqual(restoreSet(removed.sets, removed.removed, removed.index), sets);
});

test("lb/kg is remembered per device and defaults to lb", () => {
  const store = memoryStore();
  assert.equal(readStoredLoadUnit(store), "lb");
  assert.equal(parseStoredLoadUnit(null), "lb");
  assert.equal(parseStoredLoadUnit("stone"), "lb");
  writeStoredLoadUnit("kg", store);
  assert.equal(store.getItem(loadUnitStorageKey), "kg");
  assert.equal(readStoredLoadUnit(store), "kg");
  writeStoredLoadUnit("lb", store);
  assert.equal(readStoredLoadUnit(store), "lb");
});

test("an edited workout keeps its own unit instead of mixing devices", () => {
  assert.equal(hydrateWorkoutLoadUnit(["kg", "kg"], "lb"), "kg");
  assert.equal(hydrateWorkoutLoadUnit([null, "lb"], "kg"), "lb");
  assert.equal(hydrateWorkoutLoadUnit([null, null], "kg"), "kg");
});

test("collapsed summaries group identical sets and fall back to a set count", () => {
  const identical = [
    createDetailedSet("s1", { load: "225", reps: "5" }),
    createDetailedSet("s2", { load: "225", reps: "5" }),
    createDetailedSet("s3", { load: "225", reps: "5" }),
    createDetailedSet("s4", { load: "225", reps: "5" }),
    createDetailedSet("s5", { load: "225", reps: "5" }),
  ];
  assert.equal(formatExerciseSummary(identical, "lb"), "5×5 @ 225 lb");
  assert.equal(
    formatExerciseSummary([createDetailedSet("s1", { load: "80", reps: "3" })], "kg"),
    "1×3 @ 80 kg",
  );
  assert.equal(
    formatExerciseSummary([
      createDetailedSet("s1", { load: "135", reps: "5" }),
      createDetailedSet("s2", { load: "155", reps: "5" }),
    ], "lb"),
    "2×5",
  );
  assert.equal(
    formatExerciseSummary([
      createDetailedSet("s1", { load: "135", reps: "5" }),
      createDetailedSet("s2", { load: "155", reps: "3" }),
    ], "lb"),
    "2 sets",
  );
  assert.equal(formatExerciseSummary([createDetailedSet("empty")], "lb"), "1 set");
});

test("keypad Next walks reps then weight then the next set", () => {
  const fields = strengthNumericFields([
    { sets: [{}, {}] },
    { sets: [{}] },
  ]);
  assert.deepEqual(fields.map((field) => `${field.exerciseIndex}:${field.setIndex}:${field.field}`), [
    "0:0:reps",
    "0:0:load",
    "0:1:reps",
    "0:1:load",
    "1:0:reps",
    "1:0:load",
  ]);

  const first = fields[0];
  assert.ok(first);
  const second = nextStrengthField(fields, first);
  assert.ok(second);
  assert.deepEqual(second, { exerciseIndex: 0, field: "load", setIndex: 0 });
  const third = nextStrengthField(fields, second);
  assert.deepEqual(third, { exerciseIndex: 0, field: "reps", setIndex: 1 });
  const last = fields[fields.length - 1];
  assert.ok(last);
  assert.equal(nextStrengthField(fields, last), null);
  assert.deepEqual(prevStrengthField(fields, last), { exerciseIndex: 1, field: "reps", setIndex: 0 });
  assert.equal(prevStrengthField(fields, first), null);
  assert.equal(strengthFieldKey("abc", "load"), "abc:load");
});

test("the accessory names the exercise, set, and cell", () => {
  assert.equal(
    strengthAccessoryContext({
      exerciseIndex: 1,
      exerciseName: "Barbell Bench Press",
      field: "load",
      setIndex: 1,
    }),
    "Barbell Bench Press · Set 2 · Weight",
  );
  assert.equal(
    strengthAccessoryContext({
      exerciseIndex: 0,
      exerciseName: "   ",
      field: "reps",
      setIndex: 0,
    }),
    "Exercise 1 · Set 1 · Reps",
  );
});

test("the request writes the workout unit on every loaded set and never a warm-up flag", () => {
  const movements = buildDetailedMovements([
    {
      defaultMeasure: "reps",
      equipment: "Barbell",
      id: "ex1",
      movementId: null,
      movementName: " Bench ",
      sets: [
        createDetailedSet("s1", { load: "160", reps: "5" }),
        createDetailedSet("s2"),
        createDetailedSet("s3", { load: "0", reps: "8" }),
      ],
    },
  ], "kg");
  assert.deepEqual(movements, [{
    movementId: null,
    movementName: "Bench",
    sets: [
      { load: 160, loadUnit: "kg", reps: 5 },
      { load: 0, loadUnit: "kg", reps: 8 },
    ],
  }]);
  assert.equal("warmUp" in (movements[0]?.sets[0] ?? {}), false);
  assert.equal("count" in (movements[0]?.sets[0] ?? {}), false);
});

test("set rows are 56pt with a 44/56 split and a 132pt stepper", () => {
  assert.equal(setRowPitch, 56);
  assert.equal(setIndexWidth, size.iconButton);
  assert.equal(setRepsFlex, 44);
  assert.equal(setLoadFlex, 56);
  assert.equal(setsStepperWidth, 132);
  assert.equal(setDeleteRevealWidth, 80);
  assert.equal(undoToastMs, 4_000);
  assert.equal(size.hit, 44);
  assert.equal(spacing.sm, 8);
});

test("a full swipe deletes, a half swipe reveals, and a short swipe closes", () => {
  assert.equal(setRowSwipeRelease(-81, 0), "delete");
  assert.equal(setRowSwipeRelease(-80, 0), "reveal");
  assert.equal(setRowSwipeRelease(-40, 0), "reveal");
  assert.equal(setRowSwipeRelease(-10, 0), "close");
  assert.equal(setRowSwipeRelease(-20, -0.5), "delete");
  assert.equal(clampSetRowTranslate(12, 320), 0);
  assert.equal(clampSetRowTranslate(-40, 320), -40);
  assert.equal(clampSetRowTranslate(-400, 320), -320);
});

test("Android shows the custom bar only while a strength field is focused", () => {
  assert.equal(showsAndroidKeyboardAccessory("Bench · Set 2 · Weight", true), true);
  assert.equal(showsAndroidKeyboardAccessory("Bench · Set 2 · Weight", false), false);
  assert.equal(showsAndroidKeyboardAccessory(undefined, true), false);
});

test("selected and tonal strength labels stay on brandPressed", () => {
  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(fonts.extrabold, "Nunito_800ExtraBold");
  assert.equal(type.label.fontSize, 13);
});

test("a new exercise starts with one empty editable row", () => {
  const exercise = createDetailedExercise("ex");
  assert.equal(exercise.sets.length, 1);
  assert.equal(exercise.sets[0]?.reps, "");
  assert.equal(exercise.sets[0]?.load, "");
  assert.equal(exercise.movementName, "");
  assert.equal(exercise.defaultMeasure, "reps");
});

test("picker selections append exercises and keep sets when replacing a name", () => {
  const start = [createDetailedExercise("ex1", {
    equipment: "Barbell",
    movementId: "b",
    movementName: "Barbell Bench Press",
  })];
  start[0]!.sets[0]!.reps = "5";
  const added = exercisesFromPickerSelections(start, [
    catalogFromSummary({ category: null, equipment: "Barbell", id: "s", name: "Back Squat" }),
    customFromName("landmine")!,
  ]);
  assert.equal(added.exercises.length, 3);
  assert.equal(added.exercises[1]?.movementName, "Back Squat");
  assert.equal(added.exercises[1]?.movementId, "s");
  assert.equal(added.exercises[2]?.movementId, null);
  assert.equal(added.exercises[2]?.defaultMeasure, "reps");

  const replaced = exercisesFromPickerSelections(start, [
    catalogFromSummary({ category: null, equipment: "Machine", id: "a", name: "Air Bike" }),
  ], "ex1");
  assert.equal(replaced.exercises.length, 1);
  assert.equal(replaced.exercises[0]?.id, "ex1");
  assert.equal(replaced.exercises[0]?.movementName, "Air Bike");
  assert.equal(replaced.exercises[0]?.defaultMeasure, "cal");
  assert.equal(replaced.exercises[0]?.sets[0]?.reps, "5");
});
