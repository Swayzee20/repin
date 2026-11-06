export type OverlayPlatform = "ios" | "android" | "web";

export type SheetHidePhase = "idle" | "open" | "animatingClose" | "awaitingNativeHide";

export type SheetHideState = {
  hasAfterClose: boolean;
  phase: SheetHidePhase;
};

export type SheetHideEvent =
  | { type: "presented" }
  | { type: "closeRequested"; hasAfterClose: boolean }
  | { type: "animationEnded"; finished: boolean }
  | { type: "nativeDismissed"; platform: OverlayPlatform }
  | { type: "visibleFalseCommitted"; platform: OverlayPlatform }
  | { type: "unmounted" };

export type SheetHideEffect =
  | "startCloseAnimation"
  | "requestVisibleFalse"
  | "runAfterClose"
  | "acquireOverlay"
  | "releaseOverlay";

export const initialSheetHideState: SheetHideState = {
  hasAfterClose: false,
  phase: "idle",
};

export function reduceSheetHide(
  state: SheetHideState,
  event: SheetHideEvent,
): { effects: SheetHideEffect[]; ignored: boolean; state: SheetHideState } {
  switch (event.type) {
    case "presented":
      return {
        effects: ["acquireOverlay"],
        ignored: false,
        state: { hasAfterClose: false, phase: "open" },
      };
    case "closeRequested":
      if (state.phase !== "open") {
        return { effects: [], ignored: true, state };
      }
      return {
        effects: ["startCloseAnimation"],
        ignored: false,
        state: { hasAfterClose: event.hasAfterClose, phase: "animatingClose" },
      };
    case "animationEnded":
      if (state.phase !== "animatingClose") {
        return { effects: [], ignored: true, state };
      }
      return {
        effects: ["requestVisibleFalse"],
        ignored: false,
        state: { hasAfterClose: state.hasAfterClose, phase: "awaitingNativeHide" },
      };
    case "nativeDismissed":
      if (event.platform !== "ios" || state.phase !== "awaitingNativeHide") {
        return { effects: [], ignored: true, state };
      }
      return hideComplete(state);
    case "visibleFalseCommitted":
      if (state.phase === "idle") {
        return { effects: [], ignored: true, state };
      }
      if (state.phase === "open" || state.phase === "animatingClose") {
        state = { hasAfterClose: state.hasAfterClose, phase: "awaitingNativeHide" };
      }
      if (state.phase !== "awaitingNativeHide") {
        return { effects: [], ignored: true, state };
      }
      if (event.platform === "ios") {
        return { effects: [], ignored: false, state };
      }
      return hideComplete(state);
    case "unmounted":
      if (state.phase === "awaitingNativeHide") {
        return hideComplete(state);
      }
      if (state.phase === "idle") {
        return { effects: [], ignored: false, state };
      }
      return {
        effects: ["releaseOverlay"],
        ignored: false,
        state: initialSheetHideState,
      };
    default:
      return { effects: [], ignored: true, state };
  }
}

function hideComplete(state: SheetHideState) {
  const effects: SheetHideEffect[] = ["releaseOverlay"];
  if (state.hasAfterClose) effects.push("runAfterClose");
  return {
    effects,
    ignored: false,
    state: initialSheetHideState,
  };
}
