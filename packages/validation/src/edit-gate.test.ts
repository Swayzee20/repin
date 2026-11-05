import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { requiresUpdatedClient } from "./index";

test("a format log requires logVersion 2", () => {
  const stored = {
    workoutType: "functional_fitness",
    workoutFormat: "amrap" as const,
    hasMeterDistance: false,
  };
  assert.equal(requiresUpdatedClient(stored, { logVersion: null }), true);
  assert.equal(requiresUpdatedClient(stored, { logVersion: 2 }), false);
});

test("cycling requires logVersion 2", () => {
  const stored = {
    workoutType: "cycling",
    workoutFormat: null,
    hasMeterDistance: false,
  };
  assert.equal(requiresUpdatedClient(stored, {}), true);
  assert.equal(requiresUpdatedClient(stored, { logVersion: 2 }), false);
});

test("an m distance requires logVersion 2", () => {
  const stored = {
    workoutType: "run",
    workoutFormat: null,
    hasMeterDistance: true,
  };
  assert.equal(requiresUpdatedClient(stored, { logVersion: 1 }), true);
  assert.equal(requiresUpdatedClient(stored, { logVersion: 2 }), false);
});

test("legacy logs stay editable without logVersion 2", () => {
  assert.equal(requiresUpdatedClient({
    workoutType: "functional_fitness",
    workoutFormat: null,
    hasMeterDistance: false,
  }, { logVersion: null }), false);

  assert.equal(requiresUpdatedClient({
    workoutType: "run",
    workoutFormat: null,
    hasMeterDistance: false,
  }, {}), false);

  assert.equal(requiresUpdatedClient({
    workoutType: "strength_training",
    workoutFormat: null,
    hasMeterDistance: false,
  }, { logVersion: 1 }), false);
});
