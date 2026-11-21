import type {
  CommunityData,
  CommunityFeedItem,
  CommunityReactionCounts,
  GoalBadge,
  GroupSummary,
  PrBadge,
  WorkoutFeedItem,
} from "@repin/types";

export const COMMUNITY_FEED_END_REACHED_PX = 160;

export type CommunityFeedAction =
  | { type: "reset"; selectedGroupId?: string | null }
  | { type: "replace"; data: CommunityData }
  | { type: "append"; items: CommunityFeedItem[]; nextCursor: string | null }
  | { type: "hide"; matches: (item: CommunityFeedItem) => boolean }
  | { type: "updateReaction"; id: string; counts: CommunityReactionCounts }
  | { type: "updateCommentCount"; id: string; commentCount: number }
  | { type: "updatePrBadges"; id: string; prBadges: PrBadge[] }
  | { type: "updateGoalBadges"; id: string; goalBadges: GoalBadge[] };

export function emptyCommunityBoard(
  groups: GroupSummary[] = [],
  selectedGroupId: string | null = null,
): CommunityData {
  return {
    groups,
    selectedGroupId,
    communityWorkouts: [],
    communityFeed: [],
    pinnedPost: null,
    nextCursor: null,
  };
}

export function isWorkoutFeedItem(item: CommunityFeedItem): item is WorkoutFeedItem {
  return item.kind !== "general";
}

export function workoutsFromCommunityFeed(items: readonly CommunityFeedItem[]) {
  return items.filter(isWorkoutFeedItem);
}

export function communityFeedItemMatchesId(item: CommunityFeedItem, id: string) {
  if (item.kind === "general") return item.id === id;
  return item.id === id || item.communityPostId === id;
}

export function dedupeCommunityFeed(
  items: readonly CommunityFeedItem[],
  pinnedPostId?: string | null,
) {
  const seen = new Set<string>();
  if (pinnedPostId) seen.add(pinnedPostId);
  const next: CommunityFeedItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
}

export function communityFeedNearEnd(
  event: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } },
  threshold = COMMUNITY_FEED_END_REACHED_PX,
) {
  return event.contentOffset.y + event.layoutMeasurement.height >= event.contentSize.height - threshold;
}

export function reduceCommunityFeed(
  state: CommunityData | null,
  action: CommunityFeedAction,
): CommunityData | null {
  if (action.type === "replace") {
    const pinnedPost = action.data.pinnedPost ?? null;
    return {
      ...action.data,
      communityFeed: dedupeCommunityFeed(action.data.communityFeed ?? [], pinnedPost?.id),
      pinnedPost,
      nextCursor: action.data.nextCursor ?? null,
    };
  }
  if (!state) return state;

  switch (action.type) {
    case "reset":
      return {
        ...state,
        selectedGroupId: action.selectedGroupId === undefined
          ? state.selectedGroupId
          : action.selectedGroupId,
        communityFeed: [],
        communityWorkouts: [],
        pinnedPost: null,
        nextCursor: null,
      };
    case "append":
      return {
        ...state,
        communityFeed: dedupeCommunityFeed(
          [...(state.communityFeed ?? []), ...action.items],
          state.pinnedPost?.id,
        ),
        nextCursor: action.nextCursor,
      };
    case "hide": {
      const communityFeed = (state.communityFeed ?? []).filter((item) => !action.matches(item));
      const pinnedPost = state.pinnedPost && action.matches(state.pinnedPost)
        ? null
        : state.pinnedPost ?? null;
      return {
        ...state,
        communityFeed,
        pinnedPost,
        communityWorkouts: [],
      };
    }
    case "updateReaction":
      return mapFeedItem(state, action.id, (item) => ({
        ...item,
        reactionCounts: action.counts,
      }));
    case "updateCommentCount":
      return mapFeedItem(state, action.id, (item) => ({
        ...item,
        commentCount: action.commentCount,
      }));
    case "updatePrBadges":
      return mapFeedItem(state, action.id, (item) => (
        isWorkoutFeedItem(item) ? { ...item, prBadges: action.prBadges } : item
      ));
    case "updateGoalBadges":
      return mapFeedItem(state, action.id, (item) => (
        isWorkoutFeedItem(item) ? { ...item, goalBadges: action.goalBadges } : item
      ));
    default:
      return state;
  }
}

function mapFeedItem(
  state: CommunityData,
  id: string,
  update: (item: CommunityFeedItem) => CommunityFeedItem,
): CommunityData {
  return {
    ...state,
    communityFeed: (state.communityFeed ?? []).map((item) => (
      communityFeedItemMatchesId(item, id) ? update(item) : item
    )),
    pinnedPost: state.pinnedPost && communityFeedItemMatchesId(state.pinnedPost, id)
      ? update(state.pinnedPost) as typeof state.pinnedPost
      : state.pinnedPost ?? null,
  };
}
