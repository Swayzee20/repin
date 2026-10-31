import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import type { ReservedRegion } from "./reserved-regions-availability";
import { createReservedRegionApplier } from "./reserved-region-updates";

const first: ReservedRegion = {
  frame: { height: 669, width: 24, x: 400, y: 0 },
  kind: "division",
  occludesContent: false,
};

const second: ReservedRegion = {
  frame: { height: 669, width: 24, x: 463.5, y: 0 },
  kind: "division",
  occludesContent: false,
};

const third: ReservedRegion = {
  frame: { height: 40, width: 40, x: 10, y: 10 },
  kind: "occlusion",
};

test("region updates apply on a later turn and coalesce to the latest snapshot", () => {
  const applier = createReservedRegionApplier();
  const applied: (readonly ReservedRegion[])[] = [];
  const frames: (() => void)[] = [];

  function publish(regions: readonly ReservedRegion[]) {
    if (!applier.push(regions)) return;
    frames.push(() => {
      applied.push(applier.flush());
    });
  }

  publish([first]);
  publish([second]);
  publish([third]);
  assert.equal(applied.length, 0);
  assert.equal(frames.length, 1);
  const firstFrame = frames[0];
  assert.ok(firstFrame);
  firstFrame();
  assert.deepEqual(applied[0], [third]);

  publish([first]);
  assert.equal(frames.length, 2);
  const secondFrame = frames[1];
  assert.ok(secondFrame);
  secondFrame();
  assert.deepEqual(applied[1], [first]);
});

test("the native patch emits regions asynchronously and never flushSyncs", () => {
  const patch = readFileSync(
    new URL("../../../patches/react-native-reserved-regions@0.2.0.patch", import.meta.url),
    "utf8",
  );
  const added = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  assert.equal(added.some((line) => line.includes("experimental_flushSync(")), false);
  assert.equal(added.some((line) => line.includes("dispatchEvent(")), false);
  assert.equal(added.some((line) => line.includes("dispatch_async(")), true);
  assert.equal(added.some((line) => line.includes("->dispatchUniqueEvent(")), true);
  assert.equal(added.some((line) => line.includes("scheduleRegionsUpdate")), true);
});
