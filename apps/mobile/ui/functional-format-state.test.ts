import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, size, spacing } from "./theme";
import {
  addExerciseReason,
  addMovementLabel,
  amrapLengthHelper,
  amrapLengthRequired,
  amrapScoreHelper,
  buildFfMovements,
  buildFunctionalFormat,
  cappedRepsHelper,
  chooseFormatReason,
  clearedFormatDraft,
  createFfExercise,
  emptyFunctionalFormat,
  emomIntervalHelper,
  emomIntervalOptions,
  emomLengthHelper,
  emomPartialWarning,
  emomSlotLabel,
  ffExerciseRowHeight,
  ffExercisesFromPicker,
  ffQtyFieldWidth,
  ffQtyUnits,
  ffUnitPickerWidth,
  finishTimeOverCapMessage,
  formatCapClock,
  formatGridFlexBasis,
  formatGridGap,
  formatLabel,
  formatSwitchPrompt,
  functionalFormatDisabledReason,
  functionalFormatOptions,
  hasFilledScore,
  hasTimeCap,
  hydrateFfExercises,
  hydrateFunctionalFormat,
  intervalMinutesFromSeconds,
  previewFunctionalFormatSummary,
  roundsCountHelper,
  roundsSameRepsHelper,
  timeCapPlaceholder,
  validateFunctionalFormat,
  workoutListHeading,
  type FfExerciseDraft,
  type FunctionalFormatDraft,
} from "./functional-format-state";
import { catalogFromSummary, customFromName } from "./movement-picker-state";

function draft(change: Partial<FunctionalFormatDraft> = {}): FunctionalFormatDraft {
  return { ...emptyFunctionalFormat, ...change };
}

function pullUp(change: Partial<FfExerciseDraft> = {}): FfExerciseDraft {
  return createFfExercise({
    movementId: "11111111-1111-4111-8111-111111111111",
    movementName: "Pull-Up",
    qty: "5",
    unit: "reps",
    ...change,
  }, change.id ?? "ex-1");
}

test("the format picker is a 2×2 grid of AMRAP, For Time, EMOM, and Rounds", () => {
  assert.deepEqual(functionalFormatOptions.map((option) => option.value), [
    "amrap",
    "for_time",
    "emom",
    "rounds",
  ]);
  assert.deepEqual(functionalFormatOptions.map((option) => option.label), [
    "AMRAP",
    "For Time",
    "EMOM",
    "Rounds",
  ]);
  assert.equal(formatGridGap, spacing.sm);
  assert.equal(formatGridGap, 8);
  assert.equal(formatGridFlexBasis, "46%");
  assert.equal(formatLabel("for_time"), "For Time");
  assert.equal(workoutListHeading("amrap"), "Each round");
  assert.equal(workoutListHeading("for_time"), "Workout");
  assert.equal(workoutListHeading("emom"), "Each interval");
  assert.equal(workoutListHeading("rounds"), "Each round");
  assert.equal(addMovementLabel("emom"), "Add movement");
  assert.equal(addMovementLabel("amrap"), "Add exercise");
});

test("FFExerciseRow is 112 high with a 72 qty field and a 92 unit picker", () => {
  assert.equal(ffExerciseRowHeight, 112);
  assert.equal(ffExerciseRowHeight, size.hit + size.control + spacing.xl);
  assert.equal(ffQtyFieldWidth, 72);
  assert.equal(ffUnitPickerWidth, 92);
  assert.deepEqual([...ffQtyUnits], ["reps", "cal", "m", "km", "mi", "sec"]);
});

test("selected format tiles stay on brandPressed", () => {
  assert.equal(colors.brandPressed, "#9E3500");
});

test("new logs require a format; legacy edits may keep no format", () => {
  assert.equal(functionalFormatDisabledReason(draft(), [], false), chooseFormatReason);
  assert.equal(functionalFormatDisabledReason(draft(), [], true), undefined);
  assert.equal(
    functionalFormatDisabledReason(draft({ type: "amrap" }), [], false),
    amrapLengthRequired,
  );
  assert.equal(
    functionalFormatDisabledReason(draft({ type: "amrap", lengthMinutes: "12" }), [], false),
    addExerciseReason,
  );
  assert.equal(
    functionalFormatDisabledReason(draft({ type: "amrap", lengthMinutes: "12" }), [pullUp()], false),
    undefined,
  );
});

test("AMRAP requires workout length, stores duration and separate score rounds/reps", () => {
  assert.equal(amrapLengthHelper, "How long the AMRAP ran, e.g. 20 min");
  assert.equal(amrapScoreHelper, "Full rounds, plus reps into the next round");
  const cindy = draft({
    type: "amrap",
    lengthMinutes: "12",
    scoreRounds: "7",
    scoreReps: "5",
  });
  assert.equal(validateFunctionalFormat(cindy, [pullUp()]), null);
  assert.deepEqual(buildFunctionalFormat(cindy), {
    durationSeconds: 720,
    score: { reps: 5, rounds: 7 },
    type: "amrap",
  });
  assert.equal(previewFunctionalFormatSummary(cindy, [pullUp()]), "AMRAP 12 · 7 rounds + 5 reps");

  const noExtra = draft({ type: "amrap", lengthMinutes: "20", scoreRounds: "5" });
  assert.deepEqual(buildFunctionalFormat(noExtra)?.type === "amrap"
    ? buildFunctionalFormat(noExtra)
    : null, {
    durationSeconds: 1_200,
    score: { reps: 0, rounds: 5 },
    type: "amrap",
  });
  assert.equal(previewFunctionalFormatSummary(noExtra, [pullUp()]), "AMRAP 20 · 5 rounds");
  assert.equal(validateFunctionalFormat(draft({ type: "amrap" }), [pullUp()]), amrapLengthRequired);
  assert.equal(
    validateFunctionalFormat(draft({ type: "amrap", lengthMinutes: "12" }), [pullUp()]),
    "Add the rounds you completed.",
  );
});

test("For Time keeps the cap optional and switches result fields when a cap is set", () => {
  assert.equal(timeCapPlaceholder, "No cap");
  const finished = draft({
    type: "for_time",
    finishMinutes: "8",
    finishSeconds: "42",
    rounds: "1",
  });
  assert.equal(hasTimeCap(finished), false);
  assert.equal(validateFunctionalFormat(finished, [pullUp()]), null);
  assert.deepEqual(buildFunctionalFormat(finished), {
    rounds: 1,
    score: { finished: true, timeSeconds: 522 },
    timeCapSeconds: null,
    type: "for_time",
  });
  assert.equal(previewFunctionalFormatSummary(finished, [pullUp()]), "For Time · 8:42");

  const capped = draft({
    type: "for_time",
    cappedReps: "142",
    finished: false,
    rounds: "1",
    timeCapMinutes: "15",
  });
  assert.equal(hasTimeCap(capped), true);
  assert.equal(formatCapClock("15"), "15:00");
  assert.equal(cappedRepsHelper("15"), "Total reps done before the 15:00 cap");
  assert.equal(validateFunctionalFormat(capped, [pullUp()]), null);
  assert.deepEqual(buildFunctionalFormat(capped), {
    rounds: 1,
    score: { finished: false, reps: 142 },
    timeCapSeconds: 900,
    type: "for_time",
  });
  assert.equal(
    previewFunctionalFormatSummary(capped, [pullUp(), pullUp({ id: "ex-2", movementName: "Push-Up" })]),
    "For Time · 142 reps (capped at 15:00)",
  );

  const overCap = draft({
    type: "for_time",
    finishMinutes: "16",
    finishSeconds: "0",
    finished: true,
    timeCapMinutes: "15",
  });
  assert.equal(validateFunctionalFormat(overCap, [pullUp()]), "Finish time is over the 15:00 cap");
  assert.equal(finishTimeOverCapMessage("15"), "Finish time is over the 15:00 cap");
});

test("EMOM uses 1/2/3 min tiles, has no score, and labels interval slots", () => {
  assert.deepEqual(emomIntervalOptions.map((option) => option.value), [1, 2, 3]);
  assert.equal(emomIntervalHelper, "One movement per interval. They repeat in order.");
  assert.equal(emomPartialWarning, "Last interval is partial");
  assert.deepEqual(emomLengthHelper("12", 1), {
    partial: false,
    text: "12 min, every 1 min = 12 intervals",
  });
  assert.deepEqual(emomLengthHelper("13", 2), {
    partial: true,
    text: "13 min, every 2 min = 6 intervals",
  });
  assert.equal(emomSlotLabel(0, 2, 1), "Minute 1 · odd minutes");
  assert.equal(emomSlotLabel(1, 2, 1), "Minute 2 · even minutes");
  assert.equal(emomSlotLabel(0, 1, 1), "Minute 1");
  assert.equal(emomSlotLabel(2, 3, 1), "Minute 3");
  assert.equal(emomSlotLabel(0, 2, 2), "Interval 1");
  assert.equal(emomSlotLabel(1, 1, 3), "Interval 2");
  assert.equal(intervalMinutesFromSeconds(60), 1);
  assert.equal(intervalMinutesFromSeconds(120), 2);
  assert.equal(intervalMinutesFromSeconds(180), 3);

  const emom = draft({ type: "emom", intervalMinutes: 1, lengthMinutes: "12" });
  assert.equal(hasFilledScore(emom), false);
  assert.equal(validateFunctionalFormat(emom, [pullUp({ qty: "15" }), pullUp({
    id: "ex-2",
    movementName: "Burpee",
    qty: "10",
  })]), null);
  assert.deepEqual(buildFunctionalFormat(emom), {
    durationSeconds: 720,
    intervalSeconds: 60,
    score: null,
    type: "emom",
  });
  assert.equal(
    previewFunctionalFormatSummary(emom, [pullUp({ qty: "15" }), pullUp({ id: "ex-2", movementName: "Burpee", qty: "10" })]),
    "EMOM 12 · 2 movements",
  );
  assert.equal(
    previewFunctionalFormatSummary(draft({ type: "emom", intervalMinutes: 2, lengthMinutes: "20" }), [
      pullUp({ qty: "15" }),
      pullUp({ id: "ex-2", movementName: "Burpee", qty: "10" }),
    ]),
    "E2MOM 20 · 2 movements",
  );
});

test("Rounds keeps the same reps every round and treats total time as optional", () => {
  assert.equal(roundsSameRepsHelper, "Same reps every round");
  assert.equal(roundsCountHelper, "How many rounds you did");
  const helen = draft({
    type: "rounds",
    rounds: "5",
    totalMinutes: "18",
    totalSeconds: "20",
  });
  assert.equal(validateFunctionalFormat(helen, [pullUp()]), null);
  assert.deepEqual(buildFunctionalFormat(helen), {
    rounds: 5,
    score: { timeSeconds: 1_100 },
    type: "rounds",
  });
  assert.equal(previewFunctionalFormatSummary(helen, [pullUp()]), "5 rounds · 18:20");

  const noTime = draft({ type: "rounds", rounds: "5" });
  assert.deepEqual(buildFunctionalFormat(noTime), {
    rounds: 5,
    score: null,
    type: "rounds",
  });
  assert.equal(
    previewFunctionalFormatSummary(noTime, [
      pullUp({ movementName: "Run" }),
      pullUp({ id: "ex-2", movementName: "Kettlebell Swing" }),
      pullUp({ id: "ex-3", movementName: "Pull-Up" }),
    ]),
    "5 rounds · Run · Kettlebell Swing · +1 more",
  );
  assert.equal(
    functionalFormatDisabledReason(draft({ type: "rounds" }), [pullUp()], false),
    "Add how many rounds you did",
  );
});

test("one FF row becomes one set and maps qty units onto the write shape", () => {
  const movements = buildFfMovements([
    pullUp({ qty: "5", unit: "reps" }),
    createFfExercise({ movementName: "Rower", qty: "40", unit: "cal" }, "ex-2"),
    createFfExercise({ movementName: "Run", qty: "400", unit: "m" }, "ex-3"),
    createFfExercise({
      load: "24",
      movementName: "Kettlebell Swing",
      qty: "15",
      unit: "reps",
    }, "ex-4"),
    createFfExercise({ movementName: "Plank", qty: "30", unit: "sec" }, "ex-5"),
  ], "kg");
  assert.equal(movements.length, 5);
  assert.deepEqual(movements[0]?.sets, [{ reps: 5 }]);
  assert.deepEqual(movements[1]?.sets, [{ calories: 40 }]);
  assert.deepEqual(movements[2]?.sets, [{ distance: 400, distanceUnit: "m" }]);
  assert.deepEqual(movements[3]?.sets, [{ load: 24, loadUnit: "kg", reps: 15 }]);
  assert.deepEqual(movements[4]?.sets, [{ durationSeconds: 30 }]);
});

test("hydrate restores format fields and one qty/unit/load row per movement", () => {
  const amrap = hydrateFunctionalFormat({
    durationSeconds: 720,
    score: { reps: 5, rounds: 7 },
    type: "amrap",
  });
  assert.deepEqual(amrap, draft({
    type: "amrap",
    lengthMinutes: "12",
    scoreReps: "5",
    scoreRounds: "7",
  }));

  const capped = hydrateFunctionalFormat({
    rounds: 1,
    score: { finished: false, reps: 142 },
    timeCapSeconds: 900,
    type: "for_time",
  });
  assert.equal(capped.finished, false);
  assert.equal(capped.cappedReps, "142");
  assert.equal(capped.timeCapMinutes, "15");

  const rows = hydrateFfExercises([
    {
      id: "m1",
      movementId: null,
      movementName: "Rower",
      notes: null,
      position: 0,
      sets: [{
        calories: 40,
        completed: true,
        distance: null,
        distanceUnit: null,
        durationSeconds: null,
        id: "s1",
        load: null,
        loadUnit: null,
        notes: null,
        position: 0,
        reps: null,
      }],
    },
    {
      id: "m2",
      movementId: "11111111-1111-4111-8111-111111111111",
      movementName: "Kettlebell Swing",
      notes: null,
      position: 1,
      sets: [{
        calories: null,
        completed: true,
        distance: null,
        distanceUnit: null,
        durationSeconds: null,
        id: "s2",
        load: 24,
        loadUnit: "kg",
        notes: null,
        position: 0,
        reps: 15,
      }],
    },
  ]);
  assert.equal(rows[0]?.unit, "cal");
  assert.equal(rows[0]?.qty, "40");
  assert.equal(rows[1]?.unit, "reps");
  assert.equal(rows[1]?.qty, "15");
  assert.equal(rows[1]?.load, "24");
});

test("switching format keeps exercises and clears score after a confirm when a score is filled", () => {
  const scored = draft({ type: "amrap", lengthMinutes: "12", scoreRounds: "7", scoreReps: "5" });
  assert.equal(hasFilledScore(scored), true);
  assert.deepEqual(formatSwitchPrompt("amrap", "for_time"), {
    message: "Your AMRAP score will be cleared.",
    title: "Switch to For Time?",
  });
  assert.deepEqual(clearedFormatDraft("for_time"), draft({ type: "for_time" }));
  assert.equal(hasFilledScore(draft({ type: "emom", lengthMinutes: "12" })), false);

  const catalog = catalogFromSummary({
    category: "gymnastics",
    equipment: null,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Pull-Up",
  });
  const typed = customFromName("landmine");
  assert.ok(typed);
  const added = ffExercisesFromPicker([], [catalog, typed]);
  assert.equal(added.length, 2);
  assert.equal(added[0]?.movementName, "Pull-Up");
  assert.equal(added[0]?.unit, "reps");
  assert.equal(added[1]?.movementName, "landmine");
  assert.equal(added[1]?.unit, "reps");
  const replaced = ffExercisesFromPicker(added, [typed], added[0]?.id);
  assert.equal(replaced[0]?.movementName, "landmine");
  assert.equal(replaced[0]?.id, added[0]?.id);
});

test("the detailed form sends format fields and reuses MovementPicker", () => {
  const detailed = readFileSync(new URL("../app/groups/[id]/detailed-workout.tsx", import.meta.url), "utf8");
  const fields = readFileSync(new URL("./functional-format-fields.tsx", import.meta.url), "utf8");
  assert.match(detailed, /buildFunctionalFormat/);
  assert.match(detailed, /buildFfMovements/);
  assert.match(detailed, /attachLogVersion/);
  assert.match(detailed, /format,/);
  assert.match(detailed, /FunctionalFormatSetup/);
  assert.match(detailed, /FunctionalWorkoutFields/);
  assert.match(detailed, /FunctionalScoreFields/);
  assert.match(fields, /MovementPicker/);
  assert.match(fields, /checkSide="start"/);
  assert.match(fields, /addMovementLabel/);
  assert.equal(fields.includes("SetTable"), false);
});
