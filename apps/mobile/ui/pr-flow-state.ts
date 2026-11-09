import type { DetectedPr, PrDetectionResult } from "@repin/types";

export type PrFlowPresenter = "none" | "prompt" | "celebration" | "share";

export type PrFlowState = {
  busy: boolean;
  celebrated: DetectedPr[];
  error: string | null;
  finished: boolean;
  notice: "no_post" | null;
  pendingPresenter: PrFlowPresenter;
  presenter: PrFlowPresenter;
  promptIndex: number;
  skipPromptDismiss: boolean;
};

export type PrFlowEvent =
  | { type: "reset"; detection: PrDetectionResult | null }
  | { type: "continueCelebration"; hasCommunityPost: boolean }
  | { type: "presenterHidden" }
  | { type: "dismissRequested" }
  | { type: "shareStarted" }
  | { type: "shareSucceeded" }
  | { type: "shareFailed"; message: string }
  | { type: "promptStarted" }
  | { type: "promptFailed"; message: string }
  | {
      type: "promptAnswered";
      hasMorePrompts: boolean;
      merged: DetectedPr[];
    };

const idleState: PrFlowState = {
  busy: false,
  celebrated: [],
  error: null,
  finished: false,
  notice: null,
  pendingPresenter: "none",
  presenter: "none",
  promptIndex: 0,
  skipPromptDismiss: false,
};

export function initialPrFlowState(detection: PrDetectionResult | null): PrFlowState {
  if (!detection) return idleState;
  if (!detection.prompts.length && !detection.detected.length) return idleState;
  return {
    ...idleState,
    celebrated: detection.detected,
    presenter: detection.prompts.length ? "prompt" : "celebration",
  };
}

/** Hide the current RN Modal first. iOS cannot present a sheet over (or while dismissing) another Modal. */
export function hideThenPresent(state: PrFlowState, next: PrFlowPresenter): PrFlowState {
  if (state.presenter === "none") {
    return { ...state, pendingPresenter: "none", presenter: next };
  }
  if (state.presenter === next) {
    return { ...state, pendingPresenter: "none" };
  }
  return {
    ...state,
    pendingPresenter: next,
    presenter: "none",
    skipPromptDismiss: true,
  };
}

export function reducePrFlow(state: PrFlowState, event: PrFlowEvent): PrFlowState {
  switch (event.type) {
    case "reset":
      return initialPrFlowState(event.detection);
    case "continueCelebration":
      if (state.busy || state.finished) return state;
      if (state.presenter === "share" || state.pendingPresenter === "share") return state;
      if (state.presenter !== "celebration") return state;
      if (!event.hasCommunityPost) {
        return {
          ...state,
          error: null,
          finished: true,
          notice: "no_post",
          pendingPresenter: "none",
          presenter: "none",
          skipPromptDismiss: true,
        };
      }
      return hideThenPresent({ ...state, error: null, notice: null }, "share");
    case "presenterHidden":
      if (state.pendingPresenter === "none") return state;
      return {
        ...state,
        presenter: state.pendingPresenter,
        pendingPresenter: "none",
      };
    case "dismissRequested":
      if (state.busy || state.finished) return state;
      return {
        ...state,
        finished: true,
        pendingPresenter: "none",
        presenter: "none",
        skipPromptDismiss: true,
      };
    case "shareStarted":
      if (state.presenter !== "share" || state.busy || state.finished) return state;
      return { ...state, busy: true, error: null };
    case "shareSucceeded":
      return {
        ...state,
        busy: false,
        error: null,
        finished: true,
        pendingPresenter: "none",
        presenter: "none",
        skipPromptDismiss: true,
      };
    case "shareFailed":
      return {
        ...state,
        busy: false,
        error: event.message,
        finished: false,
      };
    case "promptStarted":
      if (state.busy || state.finished) return state;
      return { ...state, busy: true, error: null };
    case "promptFailed":
      return { ...state, busy: false, error: event.message };
    case "promptAnswered": {
      const celebrated = event.merged;
      const promptIndex = state.promptIndex + 1;
      if (event.hasMorePrompts) {
        return {
          ...state,
          busy: false,
          celebrated,
          error: null,
          promptIndex,
        };
      }
      if (celebrated.length) {
        return hideThenPresent({
          ...state,
          busy: false,
          celebrated,
          error: null,
          promptIndex,
          skipPromptDismiss: true,
        }, "celebration");
      }
      return {
        ...state,
        busy: false,
        celebrated,
        error: null,
        finished: true,
        pendingPresenter: "none",
        presenter: "none",
        promptIndex,
        skipPromptDismiss: true,
      };
    }
    default:
      return state;
  }
}
