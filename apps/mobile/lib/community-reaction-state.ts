import type {
  CommunityReactionSummary,
  CommunityReactionType,
  CommunityWhoReacted,
} from "@repin/types";
import { emptyReactionSummary, optimisticReactionSummary } from "@repin/validation";

export type WhoReactedSheetState =
  | { status: "closed" }
  | {
    status: "open";
    focus: CommunityReactionType;
    postId?: string;
    sessionId?: string;
    loading: boolean;
    error: string | null;
    data: CommunityWhoReacted | null;
  };

export type WhoReactedSheetAction =
  | { type: "open"; focus: CommunityReactionType; postId?: string; sessionId?: string }
  | { type: "loading" }
  | { type: "loaded"; data: CommunityWhoReacted }
  | { type: "failed"; error: string }
  | { type: "close" };

export function reduceWhoReactedSheet(
  state: WhoReactedSheetState,
  action: WhoReactedSheetAction,
): WhoReactedSheetState {
  switch (action.type) {
    case "open":
      return {
        status: "open",
        focus: action.focus,
        postId: action.postId,
        sessionId: action.sessionId,
        loading: true,
        error: null,
        data: null,
      };
    case "close":
      return { status: "closed" };
    case "loading":
      if (state.status !== "open") return state;
      return { ...state, loading: true, error: null };
    case "loaded":
      if (state.status !== "open") return state;
      return { ...state, loading: false, error: null, data: action.data };
    case "failed":
      if (state.status !== "open") return state;
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

export function applyOptimisticReaction(
  previous: CommunityReactionSummary | null | undefined,
  nextReaction: CommunityReactionType,
) {
  return optimisticReactionSummary(previous ?? emptyReactionSummary(), nextReaction);
}

export { emptyReactionSummary, optimisticReactionSummary };
