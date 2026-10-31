import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { readFileSync } from "node:fs";

import { activeDivisionFromRegions, resolveLayout } from "./layout-math";
import {
  reservedRegionsEnabled,
  reservedRegionsOrEmpty,
  reservedRegionsViewAvailable,
  shouldMountReservedRegions,
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

  let probed = false;
  assert.equal(shouldMountReservedRegions({
    extra: { reservedRegions: false },
    executionEnvironment: "bare",
    hasViewManager: () => {
      probed = true;
      return true;
    },
  }), false);
  assert.equal(probed, false);

  assert.equal(shouldMountReservedRegions({
    extra: { reservedRegions: true },
    executionEnvironment: "bare",
    hasViewManager: (name) => name === "ReservedRegionsView",
  }), true);

  assert.equal(shouldMountReservedRegions({
    extra: { reservedRegions: true },
    executionEnvironment: "storeClient",
    hasViewManager: () => true,
  }), false);

  assert.equal(shouldMountReservedRegions({
    extra: undefined,
    executionEnvironment: "standalone",
    hasViewManager: () => true,
  }), true);
});

test("the device build opts in while keeping the app identity", () => {
  const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")) as {
    expo: {
      scheme: string;
      extra: { reservedRegions: boolean; eas: { projectId: string } };
      ios: { bundleIdentifier: string };
      android: { package: string };
    };
  };
  assert.equal(app.expo.extra.reservedRegions, true);
  assert.equal(app.expo.scheme, "repin");
  assert.equal(app.expo.ios.bundleIdentifier, "com.repin.mobile");
  assert.equal(app.expo.android.package, "com.repin.mobile");
  assert.equal(app.expo.extra.eas.projectId, "e88e4ec2-8133-4ef9-9909-40dd1f6c9f3b");
});

test("pane math uses the fold region and falls back to width/2", () => {
  const fold = activeDivisionFromRegions([division]);
  assert.deepEqual(fold, { centerX: 475.5, centerY: 334.5, height: 669, width: 24 });
  const folded = resolveLayout({
    division: fold,
    insets: { left: 0, right: 84 },
    width: 951,
  });
  assert.equal(folded.split.foldActive, true);
  assert.equal(folded.split.splitX, 475.5);
  assert.equal(folded.split.gap, 24);
  assert.ok(folded.split.left.x + folded.split.left.width <= folded.split.splitX - folded.split.gap);
  assert.ok(folded.split.right.x >= folded.split.splitX + folded.split.gap);

  const open = resolveLayout({
    division: activeDivisionFromRegions([]),
    insets: { left: 0, right: 0 },
    width: 800,
  });
  assert.equal(open.split.splitX, 400);
  assert.equal(open.split.foldActive, false);
  assert.equal(open.split.foldHalf, 0);

  assert.equal(activeDivisionFromRegions([{
    frame: { height: Number.NaN, width: 24, x: 10, y: 0 },
    kind: "division",
    occludesContent: false,
  }]), null);
  assert.equal(resolveLayout({
    division: activeDivisionFromRegions([{
      frame: { height: 40, width: 40, x: 0, y: 0 },
      kind: "occlusion",
    }]),
    insets: { left: 0, right: 0 },
    width: 800,
  }).split.splitX, 400);
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
