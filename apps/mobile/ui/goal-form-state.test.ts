import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  displayTargetText,
  emptyGoalForm,
  goalFormPayload,
  hydrateGoalForm,
  validateGoalForm,
  volumeSportsFor,
} from "./goal-form-state";

test("goal form payload requires an IANA zone and a one-time end date", () => {
  const draft = emptyGoalForm();
  draft.schedule = "one_time";
  draft.deadline = null;
  assert.equal(validateGoalForm(draft, "America/Chicago"), "One-time volume goals need an end date");
  assert.equal(validateGoalForm(draft, ""), "Choose a valid time zone");
  draft.deadline = new Date("2026-12-01T12:00:00.000Z");
  assert.equal(validateGoalForm(draft, "America/Chicago"), null);
  const payload = goalFormPayload(draft, "America/Chicago");
  assert.equal(payload.kind, "volume");
  assert.equal(payload.schedule, "one_time");
  assert.equal(payload.timeZone, "America/Chicago");
});

test("time goals send strictly-faster targets as minutes and seconds", () => {
  const draft = emptyGoalForm();
  draft.kind = "time";
  draft.timeSport = "run";
  draft.lane = "5k";
  draft.targetMinutes = "20";
  draft.targetSeconds = "00";
  assert.equal(validateGoalForm(draft, "America/Chicago"), null);
  const payload = goalFormPayload(draft, "America/Chicago");
  assert.equal(payload.target, 1200);
  assert.equal(payload.lane, "5k");
  assert.equal(payload.sportFilter, "run");
});

test("edit hydration converts canonical metres, seconds, and kilograms back to the display unit", () => {
  assert.equal(displayTargetText({
    kind: "volume",
    metric: "distance",
    targetValue: 20 * 1_609.344,
    displayUnit: "mi",
  }), "20");
  assert.equal(displayTargetText({
    kind: "volume",
    metric: "minutes",
    targetValue: 45 * 60,
    displayUnit: "min",
  }), "45");
  assert.equal(displayTargetText({
    kind: "lift",
    metric: "load",
    targetValue: 300 * 0.45359237,
    displayUnit: "lb",
  }), "300");

  const draft = hydrateGoalForm({
    id: "goal-1",
    title: "20 miles this week",
    kind: "volume",
    metric: "distance",
    sportFilter: "run",
    schedule: "weekly",
    state: "active",
    displayUnit: "mi",
    targetValue: 20 * 1_609.344,
    timeZone: "America/Chicago",
    activationAt: "2026-11-10T16:00:00.000Z",
    deadlineAt: null,
    activeSlot: 1,
    createdAt: "2026-11-10T16:00:00.000Z",
    progress: { current: 0, target: 20 * 1_609.344, ratio: 0, label: "", periodLabel: null, lastQualifyingLabel: null },
    completionMethod: null,
    shareable: false,
    shareCrewName: null,
    sourceSessionId: null,
    sourceGroupId: null,
    currentPeriodId: null,
    prKind: null,
    prKey: null,
    movementId: null,
    movementName: null,
    lane: null,
    helper: "",
    canMarkDone: false,
    canReopen: false,
    reopenBlocked: false,
    archivedAt: null,
  });
  assert.equal(draft.targetText, "20");
  assert.equal(draft.displayUnit, "mi");
});

test("count and minutes goals offer all eight sports; distance stays run, walk, ride, or all", () => {
  assert.equal(volumeSportsFor("distance").length, 4);
  assert.equal(volumeSportsFor("workout_count").length, 9);
  assert.equal(volumeSportsFor("minutes").some((tile) => tile.value === "strength_training"), true);
  assert.equal(volumeSportsFor("distance").some((tile) => tile.value === "strength_training"), false);
});
