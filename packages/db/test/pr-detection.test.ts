import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  comparePrMetrics,
  decidePrAction,
  distanceToMeters,
  extractPrCandidates,
  formatHeaviestValue,
  formatPrDelta,
  isPrImprovement,
  kgToLoad,
  loadToKg,
  movementIdentity,
  normalizeMovementName,
  pickBaselineCandidate,
  prBadgeAccessibilityLabel,
  snapDistanceLane,
  visiblePrBadgeChips,
  workoutFingerprint,
  type PrCandidate,
  type PrMetric,
  type PrSessionSnapshot,
} from "../src/pr-detection";

const occurredAt = new Date("2026-11-09T12:00:00.000Z");

test("heaviest single uses reps == 1 and heavier load, ignoring other sets", () => {
  const session = strengthSession([
    movement("Back Squat", "sq-1", [
      set("s1", { reps: 5, load: 405, loadUnit: "lb" }),
      set("s2", { reps: 1, load: 315, loadUnit: "lb" }),
      set("s3", { reps: 1, load: 325, loadUnit: "lb" }),
      set("s4", { reps: 1, load: 0, loadUnit: "lb" }),
      set("s5", { reps: 1, load: null, loadUnit: "lb" }),
    ]),
  ]);
  const candidates = extractPrCandidates(session);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.kind, "heaviest_single");
  assert.equal(candidates[0]?.sourceSetId, "s3");
  assert.equal(candidates[0]?.displayValue, "1 × 325 lb");
  assert.equal(candidates[0]?.promptKind, "one_rep");
});

test("heaviest single compares in kg so 225 lb beats 100 kg", () => {
  const lb = loadToKg(225, "lb");
  const kg = loadToKg(100, "kg");
  assert.ok(lb > kg);
  assert.equal(Math.round(kgToLoad(lb, "lb")), 225);
  const heavier: PrMetric = { ...emptyMetric(), loadKg: lb };
  const lighter: PrMetric = { ...emptyMetric(), loadKg: kg };
  assert.equal(isPrImprovement("heaviest_single", heavier, lighter), true);
  assert.equal(isPrImprovement("heaviest_single", lighter, heavier), false);
  assert.equal(isPrImprovement("heaviest_single", heavier, heavier), false);
});

test("ties are never PRs for load, time, and AMRAP score", () => {
  const load: PrMetric = { ...emptyMetric(), loadKg: 140 };
  assert.equal(comparePrMetrics("heaviest_single", load, load), 0);
  assert.equal(decidePrAction(candidate("heaviest_single", load), load).action, "none");

  const time: PrMetric = { ...emptyMetric(), durationSeconds: 238, finished: true };
  assert.equal(comparePrMetrics("for_time", time, time), 0);
  assert.equal(comparePrMetrics("distance_time", time, time), 0);

  const amrap: PrMetric = { ...emptyMetric(), rounds: 12, reps: 5 };
  assert.equal(comparePrMetrics("amrap", amrap, amrap), 0);
});

test("prompt only when there is no baseline for 1-rep or For Time", () => {
  const lift = candidate("heaviest_single", { ...emptyMetric(), loadKg: 140 }, "one_rep");
  assert.equal(decidePrAction(lift, null).action, "prompt");
  assert.equal(decidePrAction(lift, { ...emptyMetric(), loadKg: 130 }).action, "auto_pr");

  const forTime = candidate("for_time", {
    ...emptyMetric(),
    durationSeconds: 238,
    finished: true,
  }, "for_time");
  assert.equal(decidePrAction(forTime, null).action, "prompt");

  const amrap = candidate("amrap", { ...emptyMetric(), rounds: 8, reps: 0 });
  assert.equal(decidePrAction(amrap, null).action, "quiet_baseline");
  assert.equal(
    decidePrAction(amrap, { ...emptyMetric(), rounds: 7, reps: 10 }).action,
    "auto_pr",
  );

  const fiveK = candidate("distance_time", { ...emptyMetric(), durationSeconds: 1450 });
  assert.equal(decidePrAction(fiveK, null).action, "quiet_baseline");
});

test("distance snapping matches 1 mi / 5K / 10K / half / marathon within 0.5%", () => {
  assert.equal(snapDistanceLane(1_609.344), "1mi");
  assert.equal(snapDistanceLane(1_609.344 * 1.004), "1mi");
  assert.equal(snapDistanceLane(5_000), "5k");
  assert.equal(snapDistanceLane(3.1 * distanceToMeters(1, "mi")), "5k");
  assert.equal(snapDistanceLane(10_000), "10k");
  assert.equal(snapDistanceLane(21_097.5), "half");
  assert.equal(snapDistanceLane(42_195), "marathon");
  assert.equal(snapDistanceLane(distanceToMeters(3.2, "mi")), null);
  assert.equal(snapDistanceLane(4_000), null);
});

test("distance PRs need session totals and ignore interval-only runs", () => {
  const withTotals = extractPrCandidates({
    ...baseSession("run"),
    workoutSubtype: "interval",
    metrics: [
      { metricType: "distance", numericValue: 5, unit: "km" },
      { metricType: "duration", numericValue: 1450, unit: "seconds" },
    ],
  });
  assert.equal(withTotals[0]?.kind, "distance_time");
  assert.equal(withTotals[0]?.key, "dt:run:5k");
  assert.equal(withTotals[0]?.displayLabel, "5K");
  assert.equal(withTotals[0]?.promptKind, null);

  const intervalOnly = extractPrCandidates({
    ...baseSession("run"),
    workoutSubtype: "interval",
    metrics: [],
  });
  assert.deepEqual(intervalOnly, []);
});

test("walk and cycling snap the same lanes as run", () => {
  const walk = extractPrCandidates({
    ...baseSession("walk"),
    metrics: [
      { metricType: "distance", numericValue: 1, unit: "mi" },
      { metricType: "duration", numericValue: 720, unit: "seconds" },
    ],
  });
  assert.equal(walk[0]?.key, "dt:walk:1mi");
  const ride = extractPrCandidates({
    ...baseSession("cycling"),
    metrics: [
      { metricType: "distance", numericValue: 10, unit: "km" },
      { metricType: "duration", numericValue: 1800, unit: "seconds" },
    ],
  });
  assert.equal(ride[0]?.key, "dt:cycling:10k");
});

test("AMRAP fingerprint ignores workout name and includes duration, loads, and order", () => {
  const movements = [
    movement("Thruster", "m1", [set("a", { reps: 21, load: 95, loadUnit: "lb" })], "thruster"),
    movement("Pull-Up", "m2", [set("b", { reps: 21, load: null, loadUnit: null })], "pull-up"),
  ];
  const left = workoutFingerprint(movements, { includeDuration: 1200 });
  const renamed = workoutFingerprint([
    { ...movements[0]!, movementName: "Cindy thruster" },
    movements[1]!,
  ], { includeDuration: 1200 });
  assert.equal(left, renamed);

  const swapped = workoutFingerprint([
    { ...movements[1]!, position: 0 },
    { ...movements[0]!, position: 1 },
  ], { includeDuration: 1200 });
  assert.notEqual(left, swapped);

  const heavier = workoutFingerprint([
    movement("Thruster", "m1", [set("a", { reps: 21, load: 100, loadUnit: "lb" })], "thruster"),
    movements[1]!,
  ], { includeDuration: 1200 });
  assert.notEqual(left, heavier);

  const otherDuration = workoutFingerprint(movements, { includeDuration: 600 });
  assert.notEqual(left, otherDuration);

  const lb = workoutFingerprint(movements, { includeDuration: 1200 });
  const kg = workoutFingerprint([
    movement("Thruster", "m1", [set("a", { reps: 21, load: loadToKg(95, "lb"), loadUnit: "kg" })], "thruster"),
    movements[1]!,
  ], { includeDuration: 1200 });
  assert.equal(lb, kg);
});

test("For Time fingerprint omits duration and finished always beats capped", () => {
  const movements = [
    movement("Thruster", "m1", [set("a", { reps: 21, load: 95, loadUnit: "lb" })]),
  ];
  const withDuration = workoutFingerprint(movements, { includeDuration: 1200 });
  const without = workoutFingerprint(movements);
  assert.notEqual(withDuration, without);

  const finished: PrMetric = { ...emptyMetric(), finished: true, durationSeconds: 400 };
  const capped: PrMetric = { ...emptyMetric(), finished: false, reps: 200 };
  assert.equal(isPrImprovement("for_time", finished, capped), true);
  assert.equal(isPrImprovement("for_time", capped, finished), false);
  assert.equal(isPrImprovement("for_time", {
    ...emptyMetric(),
    finished: true,
    durationSeconds: 238,
  }, finished), true);
  assert.equal(isPrImprovement("for_time", {
    ...emptyMetric(),
    finished: false,
    reps: 210,
  }, capped), true);
  assert.equal(isPrImprovement("for_time", capped, capped), false);
});

test("custom names normalize like getLastMovementSessionForUser", () => {
  assert.equal(normalizeMovementName("  LANDMINE "), "landmine");
  assert.equal(
    movementIdentity(null, "  LANDMINE "),
    movementIdentity(null, "landmine"),
  );
  assert.notEqual(
    movementIdentity("catalog-1", "Back Squat"),
    movementIdentity(null, "Back Squat"),
  );
});

test("catalog identity is stable when the displayed name changes", () => {
  const first = extractPrCandidates(strengthSession([
    { ...movement("Back Squat", "sq-1", [set("s1", { reps: 1, load: 315, loadUnit: "lb" })]), movementId: "catalog-1" },
  ]));
  const renamed = extractPrCandidates(strengthSession([
    { ...movement("Low Bar Squat", "sq-1", [set("s1", { reps: 1, load: 325, loadUnit: "lb" })]), movementId: "catalog-1" },
  ]));
  assert.equal(first[0]?.key, renamed[0]?.key);
});

test("pickBaselineCandidate keeps the earliest tied result", () => {
  const first = candidate("heaviest_single", { ...emptyMetric(), loadKg: 140 }, null, {
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    sourceSessionId: "a",
  });
  const laterTie = candidate("heaviest_single", { ...emptyMetric(), loadKg: 140 }, null, {
    occurredAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceSessionId: "b",
  });
  const laterBetter = candidate("heaviest_single", { ...emptyMetric(), loadKg: 150 }, null, {
    occurredAt: new Date("2026-03-01T00:00:00.000Z"),
    sourceSessionId: "c",
  });
  assert.equal(pickBaselineCandidate([laterTie, first])?.sourceSessionId, "a");
  assert.equal(pickBaselineCandidate([first, laterBetter])?.sourceSessionId, "c");
});

test("delta copy uses the display unit and unicode minus for faster times", () => {
  assert.equal(
    formatPrDelta(
      "heaviest_single",
      { ...emptyMetric(), loadKg: loadToKg(325, "lb") },
      { ...emptyMetric(), loadKg: loadToKg(315, "lb") },
      "lb",
    ),
    "+10 lb",
  );
  assert.equal(
    formatPrDelta(
      "for_time",
      { ...emptyMetric(), durationSeconds: 238, finished: true },
      { ...emptyMetric(), durationSeconds: 250, finished: true },
      "seconds",
    ),
    "−12 s",
  );
  assert.equal(formatHeaviestValue(loadToKg(325, "lb"), "lb"), "1 × 325 lb");
});

test("PR chips show two then +N with combined VoiceOver copy", () => {
  const chips = visiblePrBadgeChips(["a", "b", "c"]);
  assert.deepEqual(chips.chips, ["a", "b"]);
  assert.equal(chips.overflow, 1);
  assert.equal(chips.accessibilityLabel, "3 personal records");
  assert.equal(prBadgeAccessibilityLabel(1), "Personal record");
});

function emptyMetric(): PrMetric {
  return {
    durationSeconds: null,
    finished: null,
    loadKg: null,
    reps: null,
    rounds: null,
  };
}

function candidate(
  kind: PrCandidate["kind"],
  metric: PrMetric,
  promptKind: PrCandidate["promptKind"] = null,
  extra: Partial<PrCandidate> = {},
): PrCandidate {
  return {
    kind,
    key: `${kind}:test`,
    metric,
    displayLabel: "Test",
    displayValue: "1",
    displayUnit: "lb",
    sourceSessionId: "session",
    sourceSetId: null,
    occurredAt,
    promptKind,
    ...extra,
  };
}

function baseSession(workoutType: string): PrSessionSnapshot {
  return {
    id: "session",
    userId: "user",
    occurredAt,
    workoutType,
    metrics: [],
    movements: [],
  };
}

function strengthSession(movements: PrSessionSnapshot["movements"]): PrSessionSnapshot {
  return {
    ...baseSession("strength_training"),
    movements,
  };
}

function movement(
  name: string,
  id: string,
  sets: PrSessionSnapshot["movements"][number]["sets"],
  movementId: string | null = null,
): PrSessionSnapshot["movements"][number] {
  return {
    id,
    movementId,
    movementName: name,
    position: Number(id.replace(/\D/g, "") || 0),
    sets,
  };
}

function set(
  id: string,
  values: Partial<PrSessionSnapshot["movements"][number]["sets"][number]>,
): PrSessionSnapshot["movements"][number]["sets"][number] {
  return {
    id,
    position: 0,
    reps: null,
    load: null,
    loadUnit: null,
    durationSeconds: null,
    distance: null,
    distanceUnit: null,
    calories: null,
    completed: true,
    ...values,
  };
}
