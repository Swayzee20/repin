import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  acquireOverlay,
  occupancyForIosNativeDismiss,
  occupancyForVisible,
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

test("occupancy is acquired when already visible and iOS does not release until native hide", () => {
  assert.deepEqual(occupancyForVisible(true, "ios"), {
    acquire: true,
    presented: true,
    release: false,
  });
  assert.deepEqual(occupancyForVisible(false, "ios"), {
    acquire: false,
    presented: false,
    release: false,
  });
  assert.deepEqual(occupancyForVisible(false, "android"), {
    acquire: false,
    presented: false,
    release: true,
  });
  assert.deepEqual(occupancyForVisible(false, "web"), {
    acquire: false,
    presented: false,
    release: true,
  });
});

test("iOS native dismiss after reopen does not release a still-visible overlay", () => {
  assert.equal(occupancyForIosNativeDismiss(false).release, true);
  assert.equal(occupancyForIosNativeDismiss(true).release, false);
});
