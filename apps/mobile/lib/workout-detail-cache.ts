import type {
  CommunityPostComment,
  CommunityReactionSummary,
  CommunityWorkoutDetail,
} from "@repin/types";

const DETAIL_STALE_MS = 5 * 60_000;
const COMMENTS_STALE_MS = 2 * 60_000;

type CacheEntry<T> = {
  data: T;
  loadedAt: number;
};

const detailCache = new Map<string, CacheEntry<CommunityWorkoutDetail>>();
const commentsCache = new Map<string, CacheEntry<CommunityPostComment[]>>();
const reactionOverrides = new Map<string, CommunityReactionSummary>();
const detailRequests = new Map<string, Promise<CommunityWorkoutDetail>>();
const commentRequests = new Map<string, Promise<CommunityPostComment[]>>();

export function clearWorkoutDetailCaches() {
  detailCache.clear();
  commentsCache.clear();
  reactionOverrides.clear();
  detailRequests.clear();
  commentRequests.clear();
}

function cacheKey(groupId: string, sessionId: string) {
  return `${groupId}:${sessionId}`;
}

function readEntry<T>(entry: CacheEntry<T> | undefined, staleMs: number) {
  return entry
    ? { data: entry.data, fresh: Date.now() - entry.loadedAt < staleMs }
    : null;
}

export function readWorkoutDetailCache(groupId: string, sessionId: string) {
  const key = cacheKey(groupId, sessionId);
  const entry = detailCache.get(key);
  const reactions = reactionOverrides.get(key);
  return readEntry(
    entry && reactions
      ? { ...entry, data: { ...entry.data, reactions } }
      : entry,
    DETAIL_STALE_MS,
  );
}

export function readCachedWorkoutReactions(groupId: string, sessionId: string) {
  return reactionOverrides.get(cacheKey(groupId, sessionId)) ?? null;
}

export function writeWorkoutDetailCache(
  groupId: string,
  sessionId: string,
  workout: CommunityWorkoutDetail,
) {
  const key = cacheKey(groupId, sessionId);
  const reactions = reactionOverrides.get(key);
  detailCache.set(key, {
    data: reactions ? { ...workout, reactions } : workout,
    loadedAt: Date.now(),
  });
}

export function updateCachedWorkoutReactions(
  groupId: string,
  sessionId: string,
  reactions: CommunityReactionSummary,
) {
  const key = cacheKey(groupId, sessionId);
  reactionOverrides.set(key, reactions);
  const current = detailCache.get(key);
  if (!current) return;
  detailCache.set(key, {
    data: { ...current.data, reactions },
    loadedAt: Date.now(),
  });
}

export function readWorkoutCommentsCache(groupId: string, sessionId: string) {
  return readEntry(commentsCache.get(cacheKey(groupId, sessionId)), COMMENTS_STALE_MS);
}

export function writeWorkoutCommentsCache(
  groupId: string,
  sessionId: string,
  comments: CommunityPostComment[],
) {
  commentsCache.set(cacheKey(groupId, sessionId), {
    data: comments,
    loadedAt: Date.now(),
  });
}

export function dedupeWorkoutDetailRequest(
  groupId: string,
  sessionId: string,
  load: () => Promise<CommunityWorkoutDetail>,
) {
  const key = cacheKey(groupId, sessionId);
  const current = detailRequests.get(key);
  if (current) return current;

  const request = load().finally(() => {
    if (detailRequests.get(key) === request) detailRequests.delete(key);
  });
  detailRequests.set(key, request);
  return request;
}

export function dedupeWorkoutCommentsRequest(
  groupId: string,
  sessionId: string,
  load: () => Promise<CommunityPostComment[]>,
) {
  const key = cacheKey(groupId, sessionId);
  const current = commentRequests.get(key);
  if (current) return current;

  const request = load().finally(() => {
    if (commentRequests.get(key) === request) commentRequests.delete(key);
  });
  commentRequests.set(key, request);
  return request;
}
