import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  initialSheetHideState,
  reduceSheetHide,
} from "./sheet-hide";

test("handoff waits for native dismiss after visible=false, not animation end", () => {
  let state = initialSheetHideState;
  state = reduceSheetHide(state, { type: "presented" }).state;
  const close = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true });
  assert.equal(close.ignored, false);
  assert.deepEqual(close.effects, ["startCloseAnimation"]);
  state = close.state;

  const animated = reduceSheetHide(state, { type: "animationEnded", finished: true });
  assert.deepEqual(animated.effects, ["requestVisibleFalse"]);
  assert.equal(animated.effects.includes("runAfterClose"), false);
  state = animated.state;
  assert.equal(state.phase, "awaitingNativeHide");

  const iosCommit = reduceSheetHide(state, {
    type: "visibleFalseCommitted",
    platform: "ios",
  });
  assert.equal(iosCommit.effects.includes("runAfterClose"), false);
  assert.equal(iosCommit.state.phase, "awaitingNativeHide");

  const dismissed = reduceSheetHide(iosCommit.state, {
    type: "nativeDismissed",
    platform: "ios",
  });
  assert.deepEqual(dismissed.effects, ["releaseOverlay", "runAfterClose"]);
  assert.equal(dismissed.state.phase, "idle");
});

test("android and web complete hide on visible=false, not a timer", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;

  const android = reduceSheetHide(state, {
    type: "visibleFalseCommitted",
    platform: "android",
  });
  assert.deepEqual(android.effects, ["releaseOverlay", "runAfterClose"]);

  let webState = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  webState = reduceSheetHide(webState, { type: "closeRequested", hasAfterClose: true }).state;
  webState = reduceSheetHide(webState, { type: "animationEnded", finished: true }).state;
  const web = reduceSheetHide(webState, {
    type: "visibleFalseCommitted",
    platform: "web",
  });
  assert.deepEqual(web.effects, ["releaseOverlay", "runAfterClose"]);
});

test("repeat close taps are ignored while pending or hiding", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  const repeatWhileAnimating = reduceSheetHide(state, {
    type: "closeRequested",
    hasAfterClose: false,
  });
  assert.equal(repeatWhileAnimating.ignored, true);
  assert.equal(repeatWhileAnimating.state.phase, "animatingClose");

  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;
  const repeatWhileHiddenPending = reduceSheetHide(state, {
    type: "closeRequested",
    hasAfterClose: true,
  });
  assert.equal(repeatWhileHiddenPending.ignored, true);
  assert.equal(repeatWhileHiddenPending.state.phase, "awaitingNativeHide");
});

test("interrupted close still requests visible=false so handoff is not stuck", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  const interrupted = reduceSheetHide(state, { type: "animationEnded", finished: false });
  assert.equal(interrupted.ignored, false);
  assert.deepEqual(interrupted.effects, ["requestVisibleFalse"]);
  assert.equal(interrupted.state.phase, "awaitingNativeHide");
});

test("iOS nativeDismissed is ignored until visible=false is requested", () => {
  const open = reduceSheetHide(initialSheetHideState, { type: "presented" });
  const spurious = reduceSheetHide(open.state, {
    type: "nativeDismissed",
    platform: "ios",
  });
  assert.equal(spurious.ignored, true);
  assert.equal(spurious.effects.includes("runAfterClose"), false);
});

test("parent hiding the sheet without close() still releases occupancy after native hide", () => {
  const open = reduceSheetHide(initialSheetHideState, { type: "presented" });
  const ios = reduceSheetHide(open.state, {
    type: "visibleFalseCommitted",
    platform: "ios",
  });
  assert.equal(ios.state.phase, "awaitingNativeHide");
  assert.equal(ios.effects.includes("runAfterClose"), false);
  const dismissed = reduceSheetHide(ios.state, {
    type: "nativeDismissed",
    platform: "ios",
  });
  assert.deepEqual(dismissed.effects, ["releaseOverlay"]);
});

test("android nativeDismissed does not complete hide; visible=false does", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;
  const native = reduceSheetHide(state, {
    type: "nativeDismissed",
    platform: "android",
  });
  assert.equal(native.ignored, true);
  assert.equal(native.state.phase, "awaitingNativeHide");
  const hidden = reduceSheetHide(native.state, {
    type: "visibleFalseCommitted",
    platform: "android",
  });
  assert.deepEqual(hidden.effects, ["releaseOverlay", "runAfterClose"]);
});

test("reopen while awaiting native hide cancels afterClose; stale onDismiss is ignored", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;
  const reopened = reduceSheetHide(state, { type: "presented" });
  assert.equal(reopened.state.phase, "open");
  assert.equal(reopened.state.hasAfterClose, false);
  const staleDismiss = reduceSheetHide(reopened.state, {
    type: "nativeDismissed",
    platform: "ios",
  });
  assert.equal(staleDismiss.ignored, true);
  assert.equal(staleDismiss.effects.includes("runAfterClose"), false);
});

test("unmount after visible=false cancels afterClose; React cleanup is not native hide", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;
  const unmounted = reduceSheetHide(state, { type: "unmounted" });
  assert.deepEqual(unmounted.effects, ["releaseOverlay"]);
  assert.equal(unmounted.effects.includes("runAfterClose"), false);
  assert.equal(unmounted.state.phase, "idle");
  assert.equal(unmounted.state.hasAfterClose, false);
});

test("StrictMode-style unmount while open cancels handoff and does not present", () => {
  const open = reduceSheetHide(initialSheetHideState, { type: "presented" });
  const unmounted = reduceSheetHide(open.state, { type: "unmounted" });
  assert.deepEqual(unmounted.effects, ["releaseOverlay"]);
  assert.equal(unmounted.effects.includes("runAfterClose"), false);
  const remounted = reduceSheetHide(unmounted.state, { type: "presented" });
  assert.equal(remounted.state.phase, "open");
  assert.equal(remounted.state.hasAfterClose, false);
});

test("unmount during close animation releases occupancy without running afterClose", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: true }).state;
  const unmounted = reduceSheetHide(state, { type: "unmounted" });
  assert.deepEqual(unmounted.effects, ["releaseOverlay"]);
  assert.equal(unmounted.effects.includes("runAfterClose"), false);
});

test("close without afterClose still hides and does not run a handoff", () => {
  let state = reduceSheetHide(initialSheetHideState, { type: "presented" }).state;
  state = reduceSheetHide(state, { type: "closeRequested", hasAfterClose: false }).state;
  state = reduceSheetHide(state, { type: "animationEnded", finished: true }).state;
  const hidden = reduceSheetHide(state, {
    type: "nativeDismissed",
    platform: "ios",
  });
  assert.deepEqual(hidden.effects, ["releaseOverlay"]);
  assert.equal(hidden.effects.includes("runAfterClose"), false);
});
