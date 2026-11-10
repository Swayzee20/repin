import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, fonts, size, spacing, type } from "./theme";
import {
  appendCopiedSet,
  applyLastSessionSets,
  buildDetailedMovements,
  canAddSet,
  canRemoveSet,
  clampSetRowTranslate,
  convertLoad,
  createDetailedExercise,
  createDetailedSet,
  deletedSetMessage,
  deleteSetAt,
  exerciseHasTypedSets,
  exercisesFromPickerSelections,
  formatExerciseSummary,
  formatLastTimeLine,
  hydrateWorkoutLoadUnit,
  lastSessionFromResponse,
  lastSessionPath,
  lastSessionQuery,
  lastTimeAppliedMessage,
  lastTimePresentation,
  lastTimeUseBorder,
  lastTimeUseHeight,
  lastTimeUseWidth,
  lbPerKg,
  loadUnitStorageKey,
  maxSets,
  minSets,
  nextStrengthField,
  parseStoredLoadUnit,
  previewStrengthSummary,
  prevStrengthField,
  readSetsHintDismissed,
  readStoredLoadUnit,
  removeLastSet,
  replaceSetsBody,
  replaceSetsTitle,
  restoreSet,
  setDeleteRevealWidth,
  setIndexWidth,
  setLoadFlex,
  setRepsFlex,
  setRowPitch,
  setRowSwipeRelease,
  setsHintCopy,
  setsHintGotIt,
  setsHintHeight,
  setsHintStorageKey,
  setsStepperWidth,
  showsAndroidKeyboardAccessory,
  strengthAccessoryContext,
  strengthFieldKey,
  strengthNumericFields,
  undoToastMs,
  useUndoActionWidth,
  useUndoToastMs,
  writeSetsHintDismissed,
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

test("multi-exercise strength previews use D-3 NxR, mixed set counts, and +N more", () => {
  const squat = createDetailedExercise("sq", { movementName: "Back Squat" });
  squat.sets = Array.from({ length: 5 }, (_, index) => createDetailedSet(`sq${index}`, { load: "225", reps: "5" }));
  const bench = createDetailedExercise("bp", { movementName: "Bench Press" });
  bench.sets = [
    createDetailedSet("bp1", { load: "135", reps: "8" }),
    createDetailedSet("bp2", { load: "160", reps: "5" }),
    createDetailedSet("bp3", { load: "160", reps: "5" }),
    createDetailedSet("bp4", { load: "160", reps: "5" }),
  ];
  assert.equal(previewStrengthSummary([squat, bench], "lb"), "Back Squat 5×5 · Bench Press 4 sets");

  const deadlift = createDetailedExercise("dl", { movementName: "Deadlift" });
  deadlift.sets = [createDetailedSet("dl1", { load: "405", reps: "1" })];
  assert.equal(
    previewStrengthSummary([squat, bench, deadlift], "lb"),
    "Back Squat 5×5 · Bench Press 4 sets · +1 more",
  );

  const identicalBench = createDetailedExercise("ib", { movementName: "Bench Press" });
  identicalBench.sets = Array.from({ length: 3 }, (_, index) => createDetailedSet(`ib${index}`, { load: "160", reps: "5" }));
  assert.equal(previewStrengthSummary([identicalBench], "lb"), "Bench Press · 160 lb × 5 × 3");
});

test("selected and tonal strength labels stay on brandPressed", () => {
  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(fonts.extrabold, "Nunito_800ExtraBold");
  assert.equal(type.label.fontSize, 13);
  assert.equal(lastTimeUseBorder, colors.boardBorder);
  assert.equal(colors.boardBorder, "#F6E3D6");
  assert.equal(lastTimeUseWidth, 64);
  assert.equal(lastTimeUseHeight, size.hit);
  assert.equal(lastTimeAppliedMessage, "Previous sets loaded");
  assert.equal(useUndoToastMs, 6_000);
  assert.equal(useUndoActionWidth, 60);
});

test("the first-use Sets hint copy dismisses per device", () => {
  assert.equal(setsHintCopy, "+ copies the last set. Each set stays editable.");
  assert.equal(setsHintGotIt, "Got it");
  assert.equal(setsHintHeight, 64);
  const store = memoryStore();
  assert.equal(readSetsHintDismissed(store), false);
  writeSetsHintDismissed(store);
  assert.equal(store.getItem(setsHintStorageKey), "1");
  assert.equal(readSetsHintDismissed(store), true);
});

test("Last time formats last session sets in the workout unit and Use replaces typed rows", () => {
  const lastSets = [
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
  ];
  assert.equal(formatLastTimeLine(lastSets, "lb"), "Last time: 3×5 @ 155 lb");
  assert.equal(formatLastTimeLine(lastSets, "kg"), "Last time: 3×5 @ 70.3 kg");
  assert.equal(Math.round(convertLoad(155, "lb", "kg") * 10) / 10, 70.3);
  assert.equal(Math.round(convertLoad(70, "kg", "lb") * 10) / 10, Math.round(70 * lbPerKg * 10) / 10);

  const typed = [
    createDetailedSet("t1", { load: "225", reps: "3" }),
    createDetailedSet("t2", { load: "245", reps: "1" }),
  ];
  let n = 0;
  const applied = applyLastSessionSets(typed, lastSets, "lb", () => `u${++n}`);
  assert.ok(applied);
  assert.equal(applied.next.length, 3);
  assert.deepEqual(applied.next.map((set) => ({ load: set.load, reps: set.reps })), [
    { load: "155", reps: "5" },
    { load: "155", reps: "5" },
    { load: "155", reps: "5" },
  ]);
  assert.equal(applied.previous, typed);

  assert.equal(formatLastTimeLine([{
    calories: 40,
    distance: null,
    distanceUnit: null,
    durationSeconds: null,
    load: null,
    loadUnit: null,
    reps: null,
  }], "lb"), null);
  assert.equal(applyLastSessionSets(typed, [{
    calories: 40,
    distance: null,
    distanceUnit: null,
    durationSeconds: null,
    load: null,
    loadUnit: null,
    reps: null,
  }], "lb"), null);
});

test("Use confirms after typed sets, and mixed history is N sets never a fake uniform load", () => {
  assert.equal(replaceSetsTitle, "Replace these sets with last time?");
  assert.equal(replaceSetsBody, "Your edited sets will be replaced. You can undo this.");
  assert.equal(exerciseHasTypedSets([createDetailedSet("empty")]), false);
  assert.equal(exerciseHasTypedSets([createDetailedSet("t1", { load: "160", reps: "5" })]), true);
  assert.equal(exerciseHasTypedSets([
    createDetailedSet("t1"),
    createDetailedSet("t2"),
  ]), true);

  const mixed = [
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 135, loadUnit: "lb", reps: 8 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 165, loadUnit: "lb", reps: 3 },
  ];
  assert.deepEqual(lastTimePresentation(mixed, "lb"), { kind: "mixed", label: "4 sets" });
  assert.equal(formatLastTimeLine(mixed, "lb"), "4 sets");
  assert.equal(formatLastTimeLine(mixed, "lb")?.includes("×"), false);
  assert.equal(formatLastTimeLine(mixed, "lb")?.includes("@"), false);

  const sameRepsDifferentLoad = [
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 135, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
  ];
  assert.deepEqual(lastTimePresentation(sameRepsDifferentLoad, "lb"), { kind: "mixed", label: "3 sets" });

  const uniform = [
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
    { calories: null, distance: null, distanceUnit: null, durationSeconds: null, load: 155, loadUnit: "lb", reps: 5 },
  ];
  assert.deepEqual(lastTimePresentation(uniform, "lb"), { kind: "uniform", label: "Last time: 3×5 @ 155 lb" });
});

test("last-session query prefers movementId, hides missing history, and stays a GET read", () => {
  const byId = lastSessionQuery({
    excludeSessionId: "session-1",
    movementId: "11111111-1111-4111-8111-111111111111",
    movementName: "landmine",
  });
  assert.equal(byId?.get("movementId"), "11111111-1111-4111-8111-111111111111");
  assert.equal(byId?.get("movementName"), null);
  assert.equal(byId?.get("excludeSessionId"), "session-1");

  const byName = lastSessionQuery({ movementName: "  landmine  " });
  assert.equal(byName?.get("movementName"), "landmine");
  assert.equal(lastSessionQuery({}), null);
  assert.equal(lastSessionFromResponse({ lastSession: null }), null);
  assert.equal(lastSessionFromResponse({}), null);

  const exercises = readFileSync(new URL("./detailed-workout-exercises.tsx", import.meta.url), "utf8");
  const detailed = readFileSync(new URL("../app/groups/[id]/detailed-workout.tsx", import.meta.url), "utf8");
  assert.equal(lastSessionPath, "/api/movements/last-session");
  assert.match(exercises, /lastSessionPath/);
  assert.match(exercises, /lastTimePresentation/);
  assert.match(exercises, /applyLastSessionSets/);
  assert.match(exercises, /lastTimeUseWidth/);
  assert.match(exercises, /colors\.brandPressed/);
  assert.match(exercises, /Use last session/);
  assert.match(exercises, /setsHintCopy/);
  assert.match(exercises, /setsHintGotIt/);
  assert.match(exercises, /replaceSetsTitle/);
  assert.match(exercises, /lastTimeAppliedMessage/);
  assert.match(exercises, /4 sets · View|kind === "mixed"/);
  assert.match(exercises, /colors\.boardBorder/);
  assert.equal(exercises.includes("#F6D9C6"), false);
  assert.match(detailed, /excludeSessionId=\{editSessionId\}/);
  assert.match(detailed, /LastTimeUndoToast/);
  assert.match(detailed, /onUseUndo/);
  assert.equal(exercises.includes("repin.app"), false);
  assert.equal(exercises.includes("method: \"POST\""), false);
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

test("detailed workout validates duration before Save is busy or a photo uploads", () => {
  const detailed = readFileSync(new URL("../app/groups/[id]/detailed-workout.tsx", import.meta.url), "utf8");
  const durationIdx = detailed.indexOf("parseOptionalDurationMinutes(durationText)");
  const submittingIdx = detailed.indexOf("setSubmitting(true)");
  const uploadIdx = detailed.indexOf("workout-photos");
  assert.ok(durationIdx > 0);
  assert.ok(submittingIdx > durationIdx);
  assert.ok(uploadIdx > durationIdx);
  assert.match(detailed, /if \(durationField\.error\) \{\s*setError\(durationField\.error\);\s*return;/);
});
