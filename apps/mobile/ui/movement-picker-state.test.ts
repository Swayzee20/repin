import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { pickerCheckSize, pickerRowHeight, pickerSheetTopGap, sheetFrame } from "./overlay-state";
import { paneSplit } from "./layout-math";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import {
  addExercisesLabel,
  catalogFromSummary,
  customFromName,
  defaultMeasureForMovement,
  filterMovementsByQuery,
  formatLastUsed,
  formatPickerMeta,
  hasExactMovementMatch,
  mergeRecentSection,
  movementPickerKey,
  movementSearchDebounceMs,
  movementSearchLimit,
  movementSearchMinChars,
  movementSearchQuery,
  normalizeTypedMovementName,
  parseMovementsResponse,
  pickerChipType,
  pickerListModel,
  pickerSearchRadius,
  pickerTitle,
  recentSectionLimit,
  showsUseAsTyped,
  togglePickerSelection,
  typedMovementFromQuery,
  typedMovementNameMax,
  formatUseAsTypedLabel,
  typedNameHelper,
} from "./movement-picker-state";

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

test("search waits 250 ms and needs two characters, capped at eight matches", () => {
  assert.equal(movementSearchDebounceMs, 250);
  assert.equal(movementSearchMinChars, 2);
  assert.equal(movementSearchLimit, 8);
  assert.equal(recentSectionLimit, 8);
  assert.equal(movementSearchQuery("b"), null);
  assert.equal(movementSearchQuery("  b  "), null);
  assert.equal(movementSearchQuery("be"), "be");
  assert.equal(movementSearchQuery("  landmine  "), "landmine");
  assert.equal(movementSearchQuery("x".repeat(120))?.length, 100);
});

test("typed names collapse whitespace and stop at 160 characters", () => {
  assert.equal(typedMovementNameMax, 160);
  assert.equal(normalizeTypedMovementName("  landmine   twist  "), "landmine twist");
  assert.equal(normalizeTypedMovementName("x".repeat(200)).length, 160);
  const typed = typedMovementFromQuery("  landmine  ");
  assert.equal(typed?.movementId, null);
  assert.equal(typed?.movementName, "landmine");
  assert.equal(typed?.custom, true);
  assert.equal(typed?.defaultMeasure, "reps");
  assert.equal(customFromName("   "), null);
});

test("Use as typed stays hidden when a catalog or typed name is an exact match", () => {
  const rows = [
    catalogFromSummary({ category: null, equipment: "Barbell", id: "1", name: "Landmine Press" }),
    customFromName("Landmine Twist")!,
  ];
  assert.equal(showsUseAsTyped("l", rows), false);
  assert.equal(showsUseAsTyped("landmine", rows), true);
  assert.equal(hasExactMovementMatch("Landmine Press", rows), true);
  assert.equal(hasExactMovementMatch("  LANDMINE   TWIST  ", rows), true);
  assert.equal(showsUseAsTyped("Landmine Press", rows), false);
  assert.equal(formatUseAsTypedLabel("  landmine  "), "Use \u201clandmine\u201d as typed");
  assert.equal(formatUseAsTypedLabel("landmine"), "Use \u201clandmine\u201d as typed");
  assert.match(typedNameHelper, /Not in the list/);
});

test("empty query lists Recent then All; searching lists Movements and You've used", () => {
  const bench = catalogFromSummary({ category: "Press", equipment: "Barbell", id: "b", name: "Barbell Bench Press" });
  const squat = catalogFromSummary({ category: "Squat", equipment: "Barbell", id: "s", name: "Back Squat" });
  const twist = customFromName("Landmine Twist", "2026-10-20")!;
  const airBike = catalogFromSummary({ category: "Cardio", equipment: "Machine", id: "a", name: "Air Bike" });
  const idle = pickerListModel({
    catalog: [airBike, squat],
    query: "",
    recentCatalog: [bench, squat],
    recentCustom: [twist],
    searchResults: [],
  });
  assert.equal(idle.searching, false);
  assert.deepEqual(idle.recent.map((row) => row.movementName), ["Barbell Bench Press", "Back Squat", "Landmine Twist"]);
  assert.equal(idle.all[0]?.movementName, "Air Bike");
  assert.equal(idle.showUseAsTyped, false);

  const searching = pickerListModel({
    catalog: [airBike],
    query: "landmine",
    recentCatalog: [bench],
    recentCustom: [twist, customFromName("Sandbag Over Shoulder")!],
    searchResults: [
      catalogFromSummary({ category: null, equipment: "Barbell", id: "p", name: "Landmine Press" }),
      catalogFromSummary({ category: null, equipment: "Barbell", id: "r", name: "Landmine Row" }),
    ],
  });
  assert.equal(searching.searching, true);
  assert.equal(searching.recent.length, 0);
  assert.equal(searching.all.length, 0);
  assert.deepEqual(searching.catalogMatches.map((row) => row.movementName), ["Landmine Press", "Landmine Row"]);
  assert.deepEqual(searching.usedMatches.map((row) => row.movementName), ["Landmine Twist"]);
  assert.equal(searching.showUseAsTyped, true);
});

test("Recent mixes catalog and typed names, newest first, and caps at eight", () => {
  const catalog = Array.from({ length: 6 }, (_, index) => catalogFromSummary({
    category: null,
    equipment: "Barbell",
    id: `c${index}`,
    name: `Catalog ${index}`,
    occurredAt: `2026-10-${String(20 + index).padStart(2, "0")}T12:00:00.000Z`,
  }));
  const custom = Array.from({ length: 5 }, (_, index) => customFromName(
    `Typed ${index}`,
    `2026-11-${String(1 + index).padStart(2, "0")}T12:00:00.000Z`,
  )!);
  const merged = mergeRecentSection(catalog, custom);
  assert.equal(merged.length, 8);
  assert.equal(merged[0]?.movementName, "Typed 4");
  assert.equal(merged.some((row) => row.custom), true);
  assert.equal(merged.some((row) => !row.custom), true);
});

test("Recent still works when recent=true only returns typed names", () => {
  const parsed = parseMovementsResponse({
    movements: [{ category: null, equipment: "Machine", id: "a", name: "Air Bike" }],
    recentCustom: [{ name: "  Landmine   Twist  " }],
  });
  assert.equal(parsed.recent.length, 0);
  assert.equal(parsed.recentCustom[0]?.movementName, "Landmine Twist");
  const recent = mergeRecentSection(parsed.recent, parsed.recentCustom);
  assert.deepEqual(recent.map((row) => row.movementName), ["Landmine Twist"]);
  assert.equal(recent[0]?.movementId, null);
});

test("catalog rows pick a starter default measure; typed names stay on reps", () => {
  assert.equal(defaultMeasureForMovement("Air Bike"), "cal");
  assert.equal(defaultMeasureForMovement("Rower"), "cal");
  assert.equal(defaultMeasureForMovement("Plank"), "sec");
  assert.equal(defaultMeasureForMovement("Run"), "m");
  assert.equal(defaultMeasureForMovement("Barbell Bench Press"), "reps");
  assert.equal(defaultMeasureForMovement("landmine", true), "reps");
  assert.equal(formatPickerMeta(catalogFromSummary({
    category: null,
    equipment: "Machine",
    id: "a",
    name: "Air Bike",
  }), "catalog"), "Machine · calories");
  assert.equal(formatPickerMeta(customFromName("Landmine Twist", new Date(2026, 9, 20, 15).toISOString())!, "recent"), "Typed by you · last Oct 20");
  assert.equal(formatLastUsed(null), null);
});

test("the starter list non-reps rows keep an app-side measure", () => {
  const csv = readFileSync(resolve("../../packages/db/seed/starter-exercises.csv"), "utf8");
  for (const [name, measure] of [
    ["Air Bike", "cal"],
    ["Rower", "cal"],
    ["Plank", "sec"],
    ["Run", "m"],
    ["Sled Push", "m"],
  ] as const) {
    assert.match(csv, new RegExp(`^${name},`, "m"));
    assert.equal(defaultMeasureForMovement(name), measure);
  }
});

test("multi-select toggles and the sticky label counts exercises", () => {
  const press = catalogFromSummary({ category: null, equipment: "Barbell", id: "1", name: "Barbell Bench Press" });
  const squat = catalogFromSummary({ category: null, equipment: "Barbell", id: "2", name: "Back Squat" });
  const once = togglePickerSelection([], press);
  const twice = togglePickerSelection(once, squat);
  const again = togglePickerSelection(twice, press);
  assert.deepEqual(again.map((row) => row.movementName), ["Back Squat"]);
  assert.equal(addExercisesLabel(0), "Add exercises");
  assert.equal(addExercisesLabel(1), "Add 1 exercise");
  assert.equal(addExercisesLabel(2), "Add 2 exercises");
  assert.equal(movementPickerKey({ movementId: "1", movementName: "Bench" }), "catalog:1");
  assert.equal(movementPickerKey({ movementId: null, movementName: "  Landmine  " }), "custom:landmine");
});

test("Custom chip, search radius, and selected labels stay on brandPressed", () => {
  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(pickerChipType.fontFamily, fonts.bold);
  assert.equal(pickerChipType.fontSize, 12);
  assert.equal(pickerSearchRadius, radii.lg);
  assert.equal(pickerTitle, "Add exercises");
  assert.equal(type.title.fontFamily, fonts.display);
  assert.equal(type.title.fontSize, 22);
});

test("the picker sheet is full height with a 54pt top inset and 56pt rows", () => {
  assert.equal(pickerSheetTopGap, 54);
  assert.equal(pickerRowHeight, 56);
  assert.equal(pickerCheckSize, 28);
  assert.equal(pickerRowHeight, size.control + spacing.sm);
  const phoneSplit = paneSplit({ insets: { left: 0, right: 0 }, width: 390 });
  const full = sheetFrame({
    height: 800,
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
    split: phoneSplit,
    topGap: pickerSheetTopGap,
    width: 390,
  });
  assert.equal(full.maxHeight, 746);
  const compact = sheetFrame({
    height: 800,
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
    split: phoneSplit,
    width: 390,
  });
  assert.equal(compact.maxHeight, 800 - 47 - spacing.xl);
});

test("the picker is a GET-only sheet wired into Strength, Powerlifting, and Functional Fitness", () => {
  const picker = source("movement-picker.tsx");
  const exercises = source("detailed-workout-exercises.tsx");
  const detailed = source("../app/groups/[id]/detailed-workout.tsx");
  const sheet = source("sheet.tsx");
  assert.match(picker, /title=\{pickerTitle\}/);
  assert.match(picker, /full/);
  assert.equal(pickerTitle, "Add exercises");
  assert.equal(picker.includes("method: \"POST\""), false);
  assert.equal(picker.includes("/api/movements"), true);
  assert.match(picker, /search\.set\("recent", "true"\)/);
  assert.match(picker, /movementSearchDebounceMs/);
  assert.match(exercises, /MovementPicker/);
  assert.match(exercises, /FunctionalFitnessExerciseFields/);
  assert.match(detailed, /FunctionalFitnessExerciseFields/);
  assert.match(detailed, /usesMovementPicker/);
  assert.equal(detailed.includes("workoutType === \"hiit\" ? ("), false);
  assert.match(sheet, /full \? topGap \?\? pickerSheetTopGap/);
  assert.ok(filterMovementsByQuery([customFromName("Landmine Twist")!], "LAND").length === 1);
});
