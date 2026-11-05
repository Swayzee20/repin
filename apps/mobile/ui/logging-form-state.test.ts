import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { workoutTypes } from "@repin/types";

import { colors } from "./theme";
import {
  attachLogVersion,
  averageSpeedHelper,
  buildQuickLogResults,
  clientLogVersion,
  cyclingDistanceUnitOptions,
  distancePlaceholder,
  distanceUnitOptions,
  emptyQuickLogResults,
  formatAverageSpeed,
  functionalFitnessFormatsLabel,
  hiitExerciseHelper,
  hoursRangeError,
  hydrateDistanceUnit,
  hydrateQuickLogResults,
  isDistanceWorkout,
  joinDurationMinutes,
  runWalkDistanceUnitOptions,
  splitDurationMinutes,
  usesHoursTime,
  usesMetricFields,
  usesMovementPicker,
  validateQuickLogResults,
  workoutTypeGridAlign,
  workoutTypeSelectorOptions,
  workoutTypeSheetAccessibilityLabel,
  workoutTypeSheetMeta,
} from "./logging-form-state";

test("workout type options stay in the approved order with Cycling after Walk", () => {
  assert.deepEqual(workoutTypeSelectorOptions.map((option) => option.value), [...workoutTypes]);
  assert.deepEqual(workoutTypeSelectorOptions.map((option) => option.label), [
    "Run",
    "Walk",
    "Cycling",
    "Strength Training",
    "Powerlifting",
    "HIIT",
    "Functional Fitness",
    "Other",
  ]);
  assert.equal(workoutTypeSelectorOptions.length, 8);
  assert.equal(workoutTypeGridAlign, "center");
});

test("the type sheet marks Cycling as New and lists Functional Fitness formats", () => {
  assert.deepEqual(workoutTypeSheetMeta("cycling"), { badge: "New", subtitle: null });
  assert.deepEqual(workoutTypeSheetMeta("functional_fitness"), {
    badge: null,
    subtitle: "AMRAP · For Time · EMOM · Rounds",
  });
  assert.equal(functionalFitnessFormatsLabel, "AMRAP · For Time · EMOM · Rounds");
  assert.deepEqual(workoutTypeSheetMeta("hiit"), { badge: null, subtitle: null });
  assert.deepEqual(workoutTypeSheetMeta("run"), { badge: null, subtitle: null });
  assert.equal(workoutTypeSheetAccessibilityLabel("cycling"), "Cycling, New");
  assert.equal(
    workoutTypeSheetAccessibilityLabel("functional_fitness"),
    "Functional Fitness, AMRAP · For Time · EMOM · Rounds",
  );
});

test("Run and Walk offer meters; Cycling stays mi/km unless an m log is being edited", () => {
  assert.deepEqual(runWalkDistanceUnitOptions.map((option) => option.value), ["mi", "km", "m"]);
  assert.deepEqual(cyclingDistanceUnitOptions.map((option) => option.value), ["mi", "km"]);
  assert.deepEqual(distanceUnitOptions("run").map((option) => option.value), ["mi", "km", "m"]);
  assert.deepEqual(distanceUnitOptions("walk").map((option) => option.value), ["mi", "km", "m"]);
  assert.deepEqual(distanceUnitOptions("cycling").map((option) => option.value), ["mi", "km"]);
  assert.deepEqual(distanceUnitOptions("cycling", "m").map((option) => option.value), ["mi", "km", "m"]);
  assert.equal(hydrateDistanceUnit("m"), "m");
  assert.equal(hydrateDistanceUnit("km"), "km");
  assert.equal(hydrateDistanceUnit("mi"), "mi");
  assert.equal(hydrateDistanceUnit("yd"), "mi");
  assert.equal(hydrateDistanceUnit(null), "mi");
  assert.equal(distancePlaceholder("run", "m"), "400");
  assert.equal(distancePlaceholder("cycling", "mi"), "18.2");
  assert.equal(distancePlaceholder("walk", "km"), "3.2");
});

test("hydrate keeps an m distance instead of folding it into miles", () => {
  const draft = hydrateQuickLogResults([
    { id: "d", label: "Distance", metricType: "distance", numericValue: 400, position: 0, textValue: null, unit: "m" },
    { id: "t", label: "Time", metricType: "duration", numericValue: 72, position: 1, textValue: null, unit: "seconds" },
  ]);
  assert.equal(draft.distance, "400");
  assert.equal(draft.distanceUnit, "m");
  assert.equal(draft.timeMinutes, "1");
  assert.equal(draft.timeSeconds, "12");
});

test("Cycling and HIIT use hours; Cycling and Run/Walk send distance", () => {
  assert.equal(isDistanceWorkout("run"), true);
  assert.equal(isDistanceWorkout("walk"), true);
  assert.equal(isDistanceWorkout("cycling"), true);
  assert.equal(isDistanceWorkout("hiit"), false);
  assert.equal(usesHoursTime("cycling"), true);
  assert.equal(usesHoursTime("hiit"), true);
  assert.equal(usesHoursTime("run"), false);
  assert.equal(usesHoursTime("walk"), false);
  assert.equal(usesMetricFields("cycling"), true);
  assert.equal(usesMetricFields("hiit"), true);
  assert.equal(usesMetricFields("walk"), true);
  assert.equal(usesMetricFields("run"), false);
  assert.equal(usesMetricFields("strength_training"), false);
  assert.equal(usesMovementPicker("strength_training"), true);
  assert.equal(usesMovementPicker("powerlifting"), true);
  assert.equal(usesMovementPicker("functional_fitness"), true);
  assert.equal(usesMovementPicker("hiit"), false);
  assert.equal(usesMovementPicker("cycling"), false);
});

test("hours stay stored as total minutes so a Run/Walk field can show 65 min", () => {
  assert.deepEqual(splitDurationMinutes(""), { hours: "", minutes: "" });
  assert.deepEqual(splitDurationMinutes("5"), { hours: "", minutes: "5" });
  assert.deepEqual(splitDurationMinutes("60"), { hours: "1", minutes: "0" });
  assert.deepEqual(splitDurationMinutes("65"), { hours: "1", minutes: "5" });
  assert.equal(joinDurationMinutes("1", "5"), "65");
  assert.equal(joinDurationMinutes("1", ""), "60");
  assert.equal(joinDurationMinutes("", "28"), "28");
  assert.equal(joinDurationMinutes("", ""), "");
  assert.equal(hoursRangeError(""), null);
  assert.equal(hoursRangeError("2"), null);
  assert.equal(hoursRangeError("1.5"), "Hours must be a non-negative whole number.");
  assert.equal(hoursRangeError("-1"), "Hours must be a non-negative whole number.");
});

test("Cycling builds distance + duration and shows a derived average speed", () => {
  const draft = {
    ...emptyQuickLogResults,
    distance: "18.2",
    distanceUnit: "mi" as const,
    timeMinutes: "65",
    timeSeconds: "30",
  };
  assert.equal(validateQuickLogResults(draft, "cycling"), null);
  assert.deepEqual(buildQuickLogResults(draft, "cycling"), {
    durationSeconds: 3_930,
    metrics: [
      { metricType: "distance", numericValue: 18.2, unit: "mi" },
      { metricType: "duration", numericValue: 3_930, unit: "seconds" },
    ],
  });
  assert.equal(formatAverageSpeed(18.2, "mi", 3_930), "Avg 16.7 mph");
  assert.equal(averageSpeedHelper(draft), "Avg 16.7 mph");
  assert.equal(formatAverageSpeed(30, "km", 3_600), "Avg 30.0 km/h");
  assert.equal(formatAverageSpeed(18.2, "mi", 0), null);
  assert.equal(formatAverageSpeed(400, "m", 72), null);
  assert.equal(validateQuickLogResults({ ...draft, distance: "0" }, "cycling"), "Distance must be greater than zero.");
});

test("Run and Walk send an m distance, and HIIT stays time-only", () => {
  const run = {
    ...emptyQuickLogResults,
    distance: "400",
    distanceUnit: "m" as const,
    timeMinutes: "1",
    timeSeconds: "12",
  };
  assert.equal(validateQuickLogResults(run, "run"), null);
  assert.deepEqual(buildQuickLogResults(run, "run").metrics, [
    { metricType: "distance", numericValue: 400, unit: "m" },
    { metricType: "duration", numericValue: 72, unit: "seconds" },
  ]);
  assert.deepEqual(buildQuickLogResults(run, "walk").metrics[0], {
    metricType: "distance",
    numericValue: 400,
    unit: "m",
  });

  const hiit = { ...emptyQuickLogResults, timeMinutes: "20", timeSeconds: "0" };
  assert.equal(validateQuickLogResults(hiit, "hiit"), null);
  assert.deepEqual(buildQuickLogResults(hiit, "hiit"), {
    durationSeconds: 1_200,
    metrics: [{ metricType: "duration", numericValue: 1_200, unit: "seconds" }],
  });
  assert.equal(hiitExerciseHelper, "To list exercises, pick Functional Fitness.");
});

test("create and update bodies send logVersion 2", () => {
  assert.equal(clientLogVersion, 2);
  const created = attachLogVersion({
    workoutType: "cycling",
    metrics: [{ metricType: "distance", numericValue: 18.2, unit: "mi" }],
    movements: [],
  });
  assert.equal(created.logVersion, 2);
  const updated = attachLogVersion({
    workoutType: "run",
    metrics: [{ metricType: "distance", numericValue: 400, unit: "m" }],
  });
  assert.equal(updated.logVersion, 2);
  assert.equal(attachLogVersion({}).logVersion, 2);
});

test("selected tile and badge labels stay on brandPressed", () => {
  assert.equal(colors.brandPressed, "#9E3500");
});
