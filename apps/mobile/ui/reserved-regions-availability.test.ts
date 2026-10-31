import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  reservedRegionsEnabled,
  reservedRegionsOrEmpty,
  reservedRegionsViewAvailable,
  type ReservedRegion,
} from "./reserved-regions-availability";

const division: ReservedRegion = {
  frame: { height: 669, width: 24, x: 463.5, y: 0 },
  kind: "division",
  occludesContent: false,
};

test("Expo Go and a missing native view yield empty regions and do not throw", () => {
  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "storeClient",
    hasViewManager: () => {
      throw new Error("UnimplementedView: native component 'ReservedRegionsView' is not registered");
    },
  }), false);

  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "storeClient",
    hasViewManager: () => true,
  }), false);

  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "bare",
    hasViewManager: () => false,
  }), false);

  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "standalone",
    hasViewManager: () => {
      throw new Error("UIManager.hasViewManagerConfig is not a function");
    },
  }), false);

  assert.deepEqual(reservedRegionsOrEmpty(false, () => {
    throw new Error("native component 'ReservedRegionsView' is not registered");
  }), []);

  assert.deepEqual(reservedRegionsOrEmpty(false, () => [division]), []);
});

test("extra.reservedRegions false is the kill switch", () => {
  assert.equal(reservedRegionsEnabled({ reservedRegions: false }), false);
  assert.equal(reservedRegionsEnabled({ reservedRegions: true }), true);
  assert.equal(reservedRegionsEnabled(undefined), true);
});

test("a linked dev or TestFlight binary can read reserved regions", () => {
  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "bare",
    hasViewManager: (name) => name === "ReservedRegionsView",
  }), true);
  assert.equal(reservedRegionsViewAvailable({
    executionEnvironment: "standalone",
    hasViewManager: () => true,
  }), true);
  assert.deepEqual(reservedRegionsOrEmpty(true, () => [division]), [division]);
});
