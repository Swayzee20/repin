/**
 * Composer focus is a module singleton so a Community post can keep the
 * keyboard across a fold (modal ↔ pane) without the field remounting as a
 * new first responder. Dismissing the post must clear it, or reopening the
 * same post auto-focuses into an empty modal with only the keyboard visible.
 */

let focusedComposerSession: string | null = null;
let ignoreComposerBlur = false;
let composerBlurTimer: ReturnType<typeof setTimeout> | null = null;

export function holdComposerFocus() {
  ignoreComposerBlur = true;
  if (composerBlurTimer) {
    clearTimeout(composerBlurTimer);
    composerBlurTimer = null;
  }
}

export function releaseComposerFocus() {
  ignoreComposerBlur = false;
}

/** Tear down composer + keyboard state. Does not submit a comment. */
export function clearComposerFocus() {
  if (composerBlurTimer) {
    clearTimeout(composerBlurTimer);
    composerBlurTimer = null;
  }
  focusedComposerSession = null;
}

export function markComposerFocused(sessionId: string) {
  focusedComposerSession = sessionId;
}

export function markComposerBlurred(sessionId: string) {
  if (ignoreComposerBlur) return;
  if (focusedComposerSession === sessionId) focusedComposerSession = null;
}

export function scheduleComposerBlur(sessionId: string, delayMs = 200) {
  if (composerBlurTimer) clearTimeout(composerBlurTimer);
  composerBlurTimer = setTimeout(() => {
    composerBlurTimer = null;
    markComposerBlurred(sessionId);
  }, delayMs);
}

export function shouldRestoreComposerFocus(sessionId: string) {
  return focusedComposerSession === sessionId;
}

export function composerFocusSnapshot() {
  return {
    focusedSessionId: focusedComposerSession,
    holding: ignoreComposerBlur,
  };
}

export function resetComposerFocusForTests() {
  if (composerBlurTimer) {
    clearTimeout(composerBlurTimer);
    composerBlurTimer = null;
  }
  focusedComposerSession = null;
  ignoreComposerBlur = false;
}
