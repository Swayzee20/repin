import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  acquireOverlay,
  overlayCount,
  releaseOverlay,
  resetOverlayOccupancyForTests,
  subscribeOverlayCount,
} from "./overlay-occupancy";

test("overlay occupancy serializes presentation and is idempotent", () => {
  resetOverlayOccupancyForTests();
  let ticks = 0;
  const stop = subscribeOverlayCount(() => {
    ticks += 1;
  });
  acquireOverlay("notifications");
  acquireOverlay("notifications");
  assert.equal(overlayCount(), 1);
  acquireOverlay("chooser");
  assert.equal(overlayCount(), 2);
  releaseOverlay("notifications");
  assert.equal(overlayCount(), 1);
  releaseOverlay("chooser");
  assert.equal(overlayCount(), 0);
  releaseOverlay("chooser");
  assert.equal(overlayCount(), 0);
  assert.ok(ticks >= 3);
  stop();
  resetOverlayOccupancyForTests();
});
