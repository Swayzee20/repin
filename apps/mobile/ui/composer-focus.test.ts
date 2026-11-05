import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  clearComposerFocus,
  composerFocusSnapshot,
  holdComposerFocus,
  markComposerBlurred,
  markComposerFocused,
  releaseComposerFocus,
  resetComposerFocusForTests,
  scheduleComposerBlur,
  shouldRestoreComposerFocus,
} from "./composer-focus";

test("dismissing a post clears composer focus so the same post can reopen", () => {
  resetComposerFocusForTests();
  markComposerFocused("post-1");
  assert.equal(shouldRestoreComposerFocus("post-1"), true);
  clearComposerFocus();
  assert.equal(shouldRestoreComposerFocus("post-1"), false);
  assert.deepEqual(composerFocusSnapshot(), { focusedSessionId: null, holding: false });
});

test("a fold hold keeps focus through blur so the pane can restore it", () => {
  resetComposerFocusForTests();
  markComposerFocused("post-1");
  holdComposerFocus();
  markComposerBlurred("post-1");
  assert.equal(shouldRestoreComposerFocus("post-1"), true);
  assert.equal(composerFocusSnapshot().holding, true);
  releaseComposerFocus();
  markComposerBlurred("post-1");
  assert.equal(shouldRestoreComposerFocus("post-1"), false);
  resetComposerFocusForTests();
});

test("clearing focus drops a pending blur timer and does not submit", async () => {
  resetComposerFocusForTests();
  markComposerFocused("post-1");
  scheduleComposerBlur("post-1", 20);
  clearComposerFocus();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(shouldRestoreComposerFocus("post-1"), false);
  resetComposerFocusForTests();
});
