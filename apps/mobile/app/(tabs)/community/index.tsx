import type { CommunityData, CommunityFeedItem, CommunityPostComment, CommunityReactionSummary, CommunityReactionType, CommunityWorkoutDetail, GeneralPostFeedItem, GoalBadge, PrBadge, WorkoutFeedItem } from "@repin/types";
import {
  COMMUNITY_FEED_CLIENT_VERSION,
  COMMUNITY_FEED_PAGE_SIZE,
  communityRevampCopy,
  formatDeletePostBody,
  formatEmptyBoard,
  formatPinBody,
  formatReplacePinBody,
  generalPostCopy,
  goalCopy,
  staleBannerTime,
} from "@repin/validation";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { clearWorkoutDetailCaches } from "../../../lib/workout-detail-cache";
import {
  getWorkoutDataRevision,
  isFresh,
  markWorkoutDataStale,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { generalPostMenuItems, workoutMenuItems } from "../../../lib/content-menu";
import {
  deleteGeneralPost,
  fetchGeneralPostDetail,
  pinGeneralPost,
  postedCrewNames,
  unpinGeneralPost,
} from "../../../lib/general-posts-api";
import { useGoalBadgeUndo } from "../../../lib/goal-badge-actions";
import { usePrBadgeUndo } from "../../../lib/pr-badge-actions";
import { isLayoutPreview } from "../../../lib/layout-preview";
import {
  communityFeedItemMatchesId,
  communityFeedNearEnd,
  reduceCommunityFeed,
  workoutsFromCommunityFeed,
  type CommunityFeedAction,
} from "../../../lib/community-feed-state";
import {
  communityFoldTransition,
  communitySelectionClears,
  readCommunityPostParam,
  resolveCommunityGeneralPost,
  resolveCommunitySelection,
} from "../../../lib/community-selection";
import {
  buildCommunityBoardRows,
  communityDeviceTimeZone,
  communityItemCreatedAt,
  formatCommunityPinnedTimestamp,
} from "../../../lib/community-feed-days";
import {
  communityNewPostGap,
  generalPostFeedCardLabel,
  isOwnPost,
  workoutFeedCardLabel,
} from "../../../ui/community-feed-layout";
import { fetchWhoReacted, toggleFeedReaction } from "../../../lib/community-revamp-api";
import {
  readLastKnownLayout,
  writeLastKnownLayout,
  type LastKnownLayout,
} from "../../../lib/last-known-layout-store";
import {
  communityContextOpensPushed,
  communityContextRoute,
  communityHeaderIsCompact,
  isCommunityContextPane,
  type CommunityContextPane,
} from "../../../lib/community-revamp-layout";
import { applyOptimisticReaction, reduceWhoReactedSheet } from "../../../lib/community-reaction-state";
import { Button, LoadingState, StateCard, WorkoutSummaryCard } from "../../../ui/components";
import { CommunityDayDivider } from "../../../ui/community-day-divider";
import { CommunityContextBody } from "../../../ui/community-context-screen";
import {
  CommunityBoardHeader,
  CommunityErrorCard,
  CommunityLoadingSkeleton,
  CommunityScreenTitle,
  CrewEntryRows,
  CrewSwitcherSheet,
  WhoReactedSheet,
} from "../../../ui/community-revamp";
import { ConfirmSheet } from "../../../ui/crew-sheets";
import { GeneralPostSummaryCard } from "../../../ui/general-post-card";
import { GeneralPostDetailView } from "../../../ui/general-post-detail";
import { prCopy } from "../../../ui/pr-copy";
import { PrUndoToast } from "../../../ui/pr-undo-toast";
import { Dialog } from "../../../ui/dialog";
import { tabScreenTopStyle, TwoPane, useLayoutMode, WideColumn } from "../../../ui/layout";
import { MenuItem } from "../../../ui/menu";
import { CheckInEmptyContent } from "../../../ui/check-in-empty-content";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { readStoredScrollAnchor, ScrollAnchor, ScrollAnchorProvider, useScrollAnchor } from "../../../ui/scroll-anchor";
import { colors, fonts, size, spacing, type } from "../../../ui/theme";
import { holdComposerFocus, releaseComposerFocus, WorkoutDetailView, type WorkoutDetailFixture } from "../../../ui/workout-detail";
import { useModeration } from "../../../ui/moderation";
import { WorkoutDetailModal } from "../../../ui/workout-detail-modal";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const communityFeedAnchorKey = "community-feed";
const layoutPreviewViewerUserId = "user-jordan";

export default function CommunityTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ groupId?: string | string[]; pane?: string | string[]; post?: string | string[] }>();
  const postParam = readCommunityPostParam(params.post);
  const groupParam = readCommunityPostParam(params.groupId);
  const paneRaw = readCommunityPostParam(params.pane);
  const paneParam = isCommunityContextPane(paneRaw) ? paneRaw : null;
  const { mode } = useLayoutMode();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compactScroll = useScrollAnchor(`${mode}:${windowWidth}:${windowHeight}`, communityFeedAnchorKey);
  const layoutPreview = __DEV__ && isLayoutPreview();
  const { openWorkoutChooser, selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(!layoutPreview);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [whoReacted, dispatchWhoReacted] = useReducer(reduceWhoReactedSheet, { status: "closed" });
  const [reactionPendingId, setReactionPendingId] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const [localDayKey, setLocalDayKey] = useState(() => localDateKey(new Date()));
  const [layoutCache, setLayoutCache] = useState<LastKnownLayout | null>(null);
  const [detailTarget, setDetailTarget] = useState<{
    groupId: string;
    workout: WorkoutFeedItem;
  } | null>(null);
  const [explicitOverride, setExplicitOverride] = useState<string | null>(null);
  const modeRef = useRef(mode);
  const queuedDetail = useRef(detailTarget);
  const [deleteTarget, setDeleteTarget] = useState<WorkoutFeedItem | null>(null);
  const [deleteStage, setDeleteStage] = useState<"choose" | "confirm-workout">("choose");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [generalDelete, setGeneralDelete] = useState<GeneralPostFeedItem | null>(null);
  const [deleteCrewNames, setDeleteCrewNames] = useState<string[]>([]);
  const [pinTarget, setPinTarget] = useState<GeneralPostFeedItem | null>(null);
  const [replacePin, setReplacePin] = useState(false);
  const [unpinToast, setUnpinToast] = useState<GeneralPostFeedItem | null>(null);
  const [generalDetail, setGeneralDetail] = useState<GeneralPostFeedItem | null>(null);
  const [offline, setOffline] = useState(false);
  const dataRef = useRef<CommunityData | null>(null);
  const lastSuccessfulLoad = useRef<FreshnessRecord | null>(null);
  const inFlightRequests = useRef(new Map<string, Promise<void>>());
  const latestRequestKey = useRef<string | null>(null);
  const loadedUserId = useRef<string | null>(null);
  const feedGeneration = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadCommunity = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { data: auth, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !auth.session) {
      setError("Sign in to view Community.");
      setLoading(false);
      return;
    }
    if (loadedUserId.current && loadedUserId.current !== auth.session.user.id) {
      dataRef.current = null;
      lastSuccessfulLoad.current = null;
      setData(null);
      setLayoutCache(null);
    }
    const cachedLayout = await readLastKnownLayout(auth.session.user.id);
    if (cachedLayout) setLayoutCache((current) => current ?? cachedLayout);

    const groupKey = `community:${auth.session.user.id}:${selectedGroupId ?? "auto"}:mixed`;
    const workoutRevision = getWorkoutDataRevision();
    if (
      dataRef.current &&
      isFresh(lastSuccessfulLoad.current, groupKey, workoutRevision)
    ) return;

    const requestKey = `${groupKey}:${workoutRevision}`;
    const currentRequest = inFlightRequests.current.get(requestKey);
    if (currentRequest) return currentRequest;

    latestRequestKey.current = requestKey;
    const request = (async () => {
      setLoading(true);
      setError(null);
      try {
      const search = new URLSearchParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
        view: "community",
        feed: "mixed",
        v: String(COMMUNITY_FEED_CLIENT_VERSION),
        limit: String(COMMUNITY_FEED_PAGE_SIZE),
      });
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const generation = feedGeneration.current;
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as CommunityData & { error?: string };
      if (!response.ok) throw new Error(generalPostCopy.loadErrorTitle);
      setOffline(false);
      if (feedGeneration.current !== generation) return;
      if (latestRequestKey.current !== requestKey) return;
      const next = reduceCommunityFeed(null, { type: "replace", data: body });
      dataRef.current = next;
      loadedUserId.current = auth.session.user.id;
      lastSuccessfulLoad.current = {
        key: `community:${auth.session.user.id}:${body.selectedGroupId ?? "none"}:mixed`,
        loadedAt: Date.now(),
        workoutRevision,
      };
      setLoadMoreError(null);
      setStaleAt(null);
      setData(next);
      setSelectedGroupId(body.selectedGroupId);
      const selected = body.groups.find((group) => group.id === body.selectedGroupId);
      const previous = await readLastKnownLayout(auth.session.user.id);
      const snapshot: LastKnownLayout = {
        activityRowCount: body.crew?.activityCount ?? 0,
        crewName: selected?.name ?? null,
        firstName: previous?.firstName ?? null,
        highlightsShown: (body.crew?.highlightCount ?? 0) > 0,
        pinnedPostShown: Boolean(body.pinnedPost),
      };
      setLayoutCache(snapshot);
      await writeLastKnownLayout(auth.session.user.id, snapshot);
      } catch (loadError) {
        if (latestRequestKey.current === requestKey) {
          const message = loadError instanceof Error ? loadError.message : communityRevampCopy.loadCommunity;
          if (dataRef.current) {
            setOffline(true);
            setStaleAt(staleBannerTime());
            setError(null);
          } else {
            setError(message === "Failed to fetch" || /network|offline/i.test(message)
              ? generalPostCopy.offline
              : communityRevampCopy.loadCommunity);
          }
        }
      } finally {
        if (latestRequestKey.current === requestKey) setLoading(false);
      }
    })().finally(() => inFlightRequests.current.delete(requestKey));
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [selectedGroupId, setSelectedGroupId]);

  const applyFeed = useCallback((action: CommunityFeedAction) => {
    setData((current) => {
      const next = reduceCommunityFeed(current, action);
      dataRef.current = next;
      return next;
    });
  }, []);

  const loadMoreCommunity = useCallback(async () => {
    const cursor = dataRef.current?.nextCursor;
    if (!cursor || !supabase || loadingMoreRef.current) return;
    const { data: auth, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !auth.session) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const generation = feedGeneration.current;
    try {
      const search = new URLSearchParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
        view: "community",
        feed: "mixed",
        v: String(COMMUNITY_FEED_CLIENT_VERSION),
        limit: String(COMMUNITY_FEED_PAGE_SIZE),
        cursor,
      });
      const groupId = selectedGroupId ?? dataRef.current?.selectedGroupId;
      if (groupId) search.set("groupId", groupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as CommunityData & { error?: string };
      if (!response.ok) throw new Error(generalPostCopy.loadMoreErrorTitle);
      if (feedGeneration.current !== generation) return;
      applyFeed({
        type: "append",
        items: body.communityFeed ?? [],
        nextCursor: body.nextCursor ?? null,
      });
    } catch (loadError) {
      if (feedGeneration.current === generation) {
        setLoadMoreError(loadError instanceof Error ? loadError.message : generalPostCopy.loadMoreErrorTitle);
      }
    } finally {
      if (feedGeneration.current === generation) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [applyFeed, selectedGroupId]);

  const handleBoardScroll = useCallback((event: { nativeEvent: NativeScrollEvent }) => {
    if (loadingMoreRef.current || loadMoreError) return;
    if (!dataRef.current?.nextCursor) return;
    if (communityFeedNearEnd(event.nativeEvent)) void loadMoreCommunity();
  }, [loadMoreCommunity, loadMoreError]);

  const compactAnchorRef = compactScroll.anchorRef;
  const restoreCompactScroll = compactScroll.requestRestore;
  useEffect(() => {
    if (mode === "twoPane") return;
    const stored = readStoredScrollAnchor(communityFeedAnchorKey);
    if (!stored) return;
    compactAnchorRef.current = stored;
    restoreCompactScroll();
  }, [compactAnchorRef, mode, restoreCompactScroll]);

  const previewBoard = useMemo(() => (layoutPreview ? layoutPreviewCommunity() : null), [layoutPreview]);
  const board = previewBoard ?? data;
  const mixedFeed = useMemo<CommunityFeedItem[]>(
    () => board?.communityFeed ?? [],
    [board],
  );
  const workouts = useMemo(() => workoutsFromCommunityFeed(mixedFeed), [mixedFeed]);
  const pinnedPost = board?.pinnedPost ?? null;
  const timeZone = communityDeviceTimeZone();
  const boardRows = useMemo(
    () => buildCommunityBoardRows({
      items: mixedFeed,
      now: new Date(),
      pinnedPostId: pinnedPost?.id ?? null,
      timeZone,
    }),
    [mixedFeed, pinnedPost?.id, timeZone],
  );
  const pinnedTimestamp = useMemo(() => {
    if (!pinnedPost) return null;
    const created = communityItemCreatedAt(pinnedPost);
    return created
      ? formatCommunityPinnedTimestamp(created, timeZone, pinnedPost.editedAt)
      : "Date unavailable";
  }, [pinnedPost, timeZone]);
  const newPostGap = communityNewPostGap(mode);
  const selectedGroup = useMemo(
    () => board?.groups.find((group) => group.id === (selectedGroupId ?? board.selectedGroupId)) ?? null,
    [board, selectedGroupId],
  );
  const requestedPostId = explicitOverride ?? postParam;
  const generalFromParam = resolveCommunityGeneralPost({
    feed: mixedFeed,
    pinnedPost,
    postId: requestedPostId,
  });
  const baseSelection = resolveCommunitySelection({
    postParam: generalFromParam ? null : requestedPostId,
    workouts,
  });
  const foldSelection = generalFromParam
    ? { kind: "explicit" as const, sessionId: generalFromParam.id }
    : baseSelection;
  let selection = baseSelection;
  let detail = detailTarget;
  if (modeRef.current !== mode) {
    const previousMode = modeRef.current;
    modeRef.current = mode;
    holdComposerFocus();
    const effect = communityFoldTransition({
      modalSessionId: detailTarget?.workout.id ?? generalDetail?.id ?? null,
      nextMode: mode,
      previousMode,
      selection: foldSelection,
    });
    if (effect.closeModalImmediately) detail = null;
    if (effect.openModalSessionId) {
      const workout = workouts.find((item) => item.id === effect.openModalSessionId)
        ?? (detailTarget?.workout.id === effect.openModalSessionId ? detailTarget.workout : null);
      const groupId = selectedGroup?.id ?? detailTarget?.groupId ?? null;
      if (workout && groupId) detail = { groupId, workout };
    }
    if (effect.setExplicitPostId) {
      selection = resolveCommunitySelection({ postParam: effect.setExplicitPostId, workouts });
      if (effect.setExplicitPostId !== explicitOverride) setExplicitOverride(effect.setExplicitPostId);
    }
    queuedDetail.current = detail;
  }

  useEffect(() => {
    const next = queuedDetail.current;
    const openSheet = setTimeout(() => {
      setDetailTarget(next);
    }, 32);
    const releaseFocus = setTimeout(() => releaseComposerFocus(), 600);
    return () => {
      clearTimeout(openSheet);
      clearTimeout(releaseFocus);
    };
  }, [mode]);

  useEffect(() => {
    if (!explicitOverride || explicitOverride === postParam) return;
    router.setParams({ post: explicitOverride });
  }, [explicitOverride, postParam, router]);

  useEffect(() => {
    if (!postParam || !groupParam || groupParam === selectedGroupId) return;
    setSelectedGroupId(groupParam);
  }, [groupParam, postParam, selectedGroupId, setSelectedGroupId]);

  useEffect(() => {
    if (!postParam) return;
    const item = resolveCommunityGeneralPost({
      feed: mixedFeed,
      pinnedPost,
      postId: postParam,
    });
    if (item) setGeneralDetail(item);
  }, [mixedFeed, pinnedPost, postParam]);

  const clearPostSelection = useCallback(() => {
    setExplicitOverride(null);
    setDetailTarget(null);
    setGeneralDetail(null);
    if (postParam) router.setParams({ post: "" });
  }, [postParam, router]);

  const hideFeedItems = useCallback((matches: (item: CommunityFeedItem) => boolean) => {
    applyFeed({ type: "hide", matches });
    setDetailTarget((current) => {
      if (!current || !matches(current.workout)) return current;
      setExplicitOverride(null);
      if (postParam) router.setParams({ post: "" });
      return null;
    });
    setGeneralDetail((current) => {
      if (!current || !matches(current)) return current;
      setExplicitOverride(null);
      if (postParam) router.setParams({ post: "" });
      return null;
    });
  }, [applyFeed, postParam, router]);

  const moderation = useModeration({
    onPostHidden: (hideId) => hideFeedItems((item) => communityFeedItemMatchesId(item, hideId)),
    onUserBlocked: (userId) => hideFeedItems((item) => item.userId === userId),
  });

  const clearFeed = useCallback((nextGroupId?: string | null) => {
    feedGeneration.current += 1;
    latestRequestKey.current = `reset:${feedGeneration.current}`;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setLoadMoreError(null);
    setError(null);
    applyFeed({ type: "reset", selectedGroupId: nextGroupId });
  }, [applyFeed]);

  useFocusEffect(useCallback(() => {
    if (layoutPreview) return;
    void loadCommunity();
  }, [layoutPreview, loadCommunity]));

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = setTimeout(() => {
      markWorkoutDataStale();
      setLocalDayKey(localDateKey(new Date()));
    }, nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timeout);
  }, [localDayKey]);

  useEffect(() => {
    if (layoutPreview) return;
    void loadCommunity();
  }, [layoutPreview, loadCommunity, localDayKey]);

  const previousLayoutMode = useRef(mode);
  useEffect(() => {
    const previous = previousLayoutMode.current;
    previousLayoutMode.current = mode;
    if (previous === "twoPane" && communityContextOpensPushed(mode) && paneParam) {
      router.push(communityContextRoute(paneParam));
      router.setParams({ pane: "" });
    }
  }, [mode, paneParam, router]);


  const openWorkoutDetail = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    setSwitcherOpen(false);
    setGeneralDetail(null);
    if (mode === "twoPane" && paneParam) router.setParams({ pane: "" });
    if (mode === "twoPane") {
      setExplicitOverride(workout.id);
      router.setParams({ post: workout.id });
      return;
    }
    setDetailTarget({ groupId: selectedGroup.id, workout });
  }, [mode, paneParam, router, selectedGroup]);

  const openGeneralPostDetail = useCallback((post: GeneralPostFeedItem) => {
    if (!selectedGroup) return;
    setSwitcherOpen(false);
    setDetailTarget(null);
    if (mode === "twoPane" && paneParam) router.setParams({ pane: "" });
    if (mode === "twoPane") {
      setGeneralDetail(post);
      setExplicitOverride(post.id);
      router.setParams({ post: post.id });
      return;
    }
    setGeneralDetail(post);
  }, [mode, paneParam, router, selectedGroup]);

  const updateFeedReactionSummary = useCallback((sessionId: string, reactions: CommunityReactionSummary) => {
    applyFeed({
      type: "updateReaction",
      id: sessionId,
      counts: reactions.counts,
      viewerReaction: reactions.viewerReaction,
    });
  }, [applyFeed]);

  const openContextPane = useCallback((pane: CommunityContextPane) => {
    setSwitcherOpen(false);
    setDetailTarget(null);
    setGeneralDetail(null);
    setExplicitOverride(null);
    if (communityContextOpensPushed(mode)) {
      router.push(communityContextRoute(pane));
      return;
    }
    router.setParams({ pane, post: "" });
  }, [mode, router]);

  const openWhoReacted = useCallback((input: {
    focus: CommunityReactionType;
    postId?: string;
    sessionId?: string;
  }) => {
    dispatchWhoReacted({ type: "open", ...input });
  }, []);

  const loadWhoReacted = useCallback(async () => {
    if (whoReacted.status !== "open" || !selectedGroup || !supabase) return;
    const postId = whoReacted.postId;
    const sessionId = whoReacted.sessionId;
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("Sign in to see who reacted.");
      const body = await fetchWhoReacted({
        accessToken: auth.session.access_token,
        groupId: selectedGroup.id,
        postId,
        sessionId,
      });
      dispatchWhoReacted({ type: "loaded", data: body.reactions });
    } catch (loadError) {
      dispatchWhoReacted({
        type: "failed",
        error: loadError instanceof Error ? loadError.message : communityRevampCopy.loadPost,
      });
    }
  }, [selectedGroup, whoReacted]);

  useEffect(() => {
    if (whoReacted.status !== "open") return;
    if (whoReacted.data || whoReacted.error || !whoReacted.loading) return;
    void loadWhoReacted();
  }, [loadWhoReacted, whoReacted]);

  const toggleCardReaction = useCallback(async (
    item: CommunityFeedItem,
    reactionType: CommunityReactionType,
  ) => {
    if (!selectedGroup || !supabase || reactionPendingId) return;
    const previous = {
      counts: item.reactionCounts ?? { clap: 0, fire: 0, strong: 0 },
      total: 0,
      viewerReaction: item.viewerReaction ?? null,
    };
    const optimistic = applyOptimisticReaction(previous, reactionType);
    setReactionPendingId(item.id);
    applyFeed({
      type: "updateReaction",
      id: item.id,
      counts: optimistic.counts,
      viewerReaction: optimistic.viewerReaction,
    });
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("Sign in to react.");
      const reactions = await toggleFeedReaction({
        accessToken: auth.session.access_token,
        groupId: selectedGroup.id,
        postId: item.kind === "general" ? item.id : item.communityPostId,
        sessionId: item.kind === "general" ? undefined : item.id,
        reactionType,
        removing: previous.viewerReaction === reactionType,
      });
      applyFeed({
        type: "updateReaction",
        id: item.id,
        counts: reactions.counts,
        viewerReaction: reactions.viewerReaction,
      });
    } catch {
      applyFeed({
        type: "updateReaction",
        id: item.id,
        counts: previous.counts,
        viewerReaction: previous.viewerReaction,
      });
    } finally {
      setReactionPendingId(null);
    }
  }, [applyFeed, reactionPendingId, selectedGroup]);

  const updateFeedCommentCount = useCallback((sessionId: string, commentCount: number) => {
    applyFeed({ type: "updateCommentCount", id: sessionId, commentCount });
  }, [applyFeed]);

  const updateFeedPrBadges = useCallback((sessionId: string, prBadges: PrBadge[]) => {
    applyFeed({ type: "updatePrBadges", id: sessionId, prBadges });
    setDetailTarget((current) => current?.workout.id === sessionId
      ? { ...current, workout: { ...current.workout, prBadges } }
      : current);
  }, [applyFeed]);
  const {
    clear: clearPrToast,
    remove: removePrBadge,
    undo: undoPrBadge,
    visible: prToastVisible,
  } = usePrBadgeUndo(updateFeedPrBadges);

  const updateFeedGoalBadges = useCallback((sessionId: string, goalBadges: GoalBadge[]) => {
    applyFeed({ type: "updateGoalBadges", id: sessionId, goalBadges });
    setDetailTarget((current) => current?.workout.id === sessionId
      ? { ...current, workout: { ...current.workout, goalBadges } }
      : current);
  }, [applyFeed]);
  const {
    clear: clearGoalToast,
    remove: removeGoalBadge,
    undo: undoGoalBadge,
    visible: goalToastVisible,
  } = useGoalBadgeUndo(updateFeedGoalBadges);

  const editWorkout = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    router.push(`/groups/${encodeURIComponent(selectedGroup.id)}/workouts/${encodeURIComponent(workout.id)}/edit`);
  }, [router, selectedGroup]);

  const openNewPost = useCallback(() => {
    if (!selectedGroup) return;
    router.push(`/groups/${encodeURIComponent(selectedGroup.id)}/new-post`);
  }, [router, selectedGroup]);

  const editGeneralPost = useCallback((post: GeneralPostFeedItem) => {
    if (!selectedGroup) return;
    router.push(`/groups/${encodeURIComponent(selectedGroup.id)}/posts/${encodeURIComponent(post.id)}/edit`);
  }, [router, selectedGroup]);

  const generalMenu = useCallback((post: GeneralPostFeedItem) => generalPostMenuItems({
    isPinned: pinnedPost?.id === post.id,
    onBlock: (item) => moderation.askBlock(item.userId, item.displayName, {
      displayName: item.displayName,
      hideId: item.id,
      kind: "post",
      targetId: item.id,
      userId: item.userId,
    }),
    onDelete: (item) => {
      setGeneralDelete(item);
      setDeleteCrewNames(selectedGroup ? [selectedGroup.name] : []);
      void (async () => {
        if (!selectedGroup || !supabase) return;
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session) return;
        const detail = await fetchGeneralPostDetail({
          accessToken: auth.session.access_token,
          groupId: selectedGroup.id,
          postId: item.id,
        }).catch(() => null);
        if (!detail) return;
        const names = postedCrewNames(detail);
        if (names.length) setDeleteCrewNames(names);
      })();
    },
    onEdit: editGeneralPost,
    onPin: setPinTarget,
    onReport: (item) => moderation.askReportPost({
      id: item.id,
      communityPostId: item.id,
      displayName: item.displayName,
      userId: item.userId,
    }),
    onUnpin: (item) => {
      void (async () => {
        if (!selectedGroup || !supabase) return;
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session) return;
        await unpinGeneralPost({
          accessToken: auth.session.access_token,
          groupId: selectedGroup.id,
          postId: item.id,
        });
        markWorkoutDataStale();
        setUnpinToast(item);
        void loadCommunity();
      })();
    },
    post,
    viewerRole: selectedGroup && selectedGroup.ownerId === loadedUserId.current ? "owner" : "member",
    viewerUserId: loadedUserId.current,
  }), [editGeneralPost, loadCommunity, moderation, pinnedPost?.id, selectedGroup]);

  const restoreUnpinnedPost = useCallback((item: GeneralPostFeedItem) => {
    void (async () => {
      if (!selectedGroup || !supabase) return;
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      try {
        await pinGeneralPost({
          accessToken: auth.session.access_token,
          groupId: selectedGroup.id,
          postId: item.id,
        });
      } catch (pinError) {
        const status = (pinError as { status?: number }).status;
        if (status !== 409) return;
        await pinGeneralPost({
          accessToken: auth.session.access_token,
          groupId: selectedGroup.id,
          postId: item.id,
          replace: true,
        }).catch(() => undefined);
      }
      markWorkoutDataStale();
      void loadCommunity();
    })();
  }, [loadCommunity, selectedGroup]);

  const feedMenu = useCallback((workout: WorkoutFeedItem) => workoutMenuItems({
    onBlock: (item) => moderation.askBlock(item.userId, item.displayName, {
      displayName: item.displayName,
      hideId: item.id,
      kind: "post",
      targetId: item.communityPostId ?? item.id,
      userId: item.userId,
    }),
    onDelete: (item) => {
      setDeleteError(null);
      setDeleteStage("choose");
      setDeleteTarget(item);
    },
    onEdit: editWorkout,
    onRemoveGoalBadge: (item) => void removeGoalBadge(item),
    onRemovePrBadge: (item) => void removePrBadge(item),
    onReport: (item) => moderation.askReportPost(item),
    viewerUserId: loadedUserId.current,
    workout,
  }), [editWorkout, moderation, removeGoalBadge, removePrBadge]);

  const deleteWorkout = useCallback(async (scope: "post" | "workout") => {
    if (!deleteTarget || !selectedGroup || !supabase) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !auth.session) throw new Error("Sign in to delete this workout.");
      const response = await fetch(
        `${apiUrl}/api/groups/${encodeURIComponent(selectedGroup.id)}/workouts/${encodeURIComponent(deleteTarget.id)}?scope=${scope}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${auth.session.access_token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await response.json()) as { error?: string; photoPaths?: string[] };
      if (!response.ok) throw new Error(body.error ?? "Workout could not be deleted.");
      if (body.photoPaths?.length) {
        const ownedPaths = body.photoPaths.filter((path) => path.startsWith(`${auth.session.user.id}/`));
        if (ownedPaths.length) await supabase.storage.from("workout-photos").remove(ownedPaths);
      }
      markWorkoutDataStale();
      clearWorkoutDetailCaches();
      if (postParam === deleteTarget.id || explicitOverride === deleteTarget.id || detailTarget?.workout.id === deleteTarget.id) {
        clearPostSelection();
      }
      hideFeedItems((item) => communityFeedItemMatchesId(item, deleteTarget.id));
      setDeleteTarget(null);
      setDeleteStage("choose");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Workout could not be deleted.");
    } finally {
      setDeletePending(false);
    }
  }, [clearPostSelection, deleteTarget, detailTarget?.workout.id, explicitOverride, hideFeedItems, postParam, selectedGroup]);

  const entryRows = selectedGroup ? (
    <CrewEntryRows
      activityCount={board?.crew?.activityCount ?? 0}
      highlightCount={board?.crew?.highlightCount ?? 0}
      onOpenActivity={() => openContextPane("activity")}
      onOpenHighlights={() => openContextPane("highlights")}
      selected={mode === "twoPane" ? paneParam : null}
    />
  ) : null;

  if (!layoutPreview && loading && !data) {
    return (
      <View style={[styles.safeArea, tabScreenTopStyle(insets.top)]}>
        <SafeAreaView edges={["left", "right"]} style={styles.flex}>
          <WideColumn fill>
            <View style={styles.content}>
              <CommunityLoadingSkeleton cache={layoutCache} compact={communityHeaderIsCompact(mode)} />
            </View>
          </WideColumn>
        </SafeAreaView>
      </View>
    );
  }
  if (!layoutPreview && error && !data) {
    return (
      <View style={[styles.safeArea, tabScreenTopStyle(insets.top)]}>
        <SafeAreaView edges={["left", "right"]} style={styles.flex}>
          <WideColumn fill>
            <View style={styles.state}>
              <CommunityScreenTitle />
              <CommunityErrorCard onRetry={() => void loadCommunity()} />
            </View>
          </WideColumn>
        </SafeAreaView>
      </View>
    );
  }

  const previewFixture = layoutPreview && selection.kind !== "none" ? layoutPreviewDetail(selection.sessionId) : null;
  const openSessionId = selection.kind === "none" ? null : selection.sessionId;
  const viewerUserId = layoutPreview ? layoutPreviewViewerUserId : loadedUserId.current;

  if (mode === "twoPane" && selectedGroup) {
    return (
      <View style={[styles.safeArea, tabScreenTopStyle(insets.top)]}>
        <View style={styles.flex}>
          <TwoPane
            fallback="hide-right"
            keyboardShouldPersistTaps="handled"
            leftAnchorKey={communityFeedAnchorKey}
            onLeftScroll={handleBoardScroll}
            scrollableRight={false}
            left={(
              <View style={styles.paneColumn}>
                <ScrollAnchor id="community-header">
                  <CommunityBoardHeader
                    compact={communityHeaderIsCompact(mode)}
                    entryRow={entryRows}
                    memberCount={board?.crew?.memberCount ?? selectedGroup.memberCount ?? 1}
                    newPostGap={newPostGap}
                    onNewPost={openNewPost}
                    onOpenCrew={() => router.push(`/groups/${selectedGroup.id}`)}
                    onOpenSwitcher={() => setSwitcherOpen(true)}
                    onRetryStale={() => void loadCommunity()}
                    photoUrl={board?.crew?.photoUrl ?? selectedGroup.photoUrl}
                    selectedGroup={selectedGroup}
                    staleAt={staleAt}
                  />
                </ScrollAnchor>
                {pinnedPost ? (
                  <ScrollAnchor id={pinnedPost.id}>
                    <Pressable
                      accessibilityLabel={generalPostFeedCardLabel(isOwnPost(pinnedPost.userId, viewerUserId))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pinnedPost.id === (generalDetail?.id ?? openSessionId) }}
                      onPress={() => openGeneralPostDetail(pinnedPost)}
                    >
                      <GeneralPostSummaryCard
                        isPinned
                        menuItems={generalMenu(pinnedPost)}
                        onOpenWhoReacted={(type) => openWhoReacted({ focus: type, postId: pinnedPost.id })}
                        onToggleReaction={(type) => void toggleCardReaction(pinnedPost, type)}
                        post={pinnedPost}
                        reactionPending={reactionPendingId === pinnedPost.id}
                        selected={pinnedPost.id === (generalDetail?.id ?? openSessionId)}
                        showCommentCount
                        showReactionSummary
                        timestamp={pinnedTimestamp ?? undefined}
                        viewerUserId={viewerUserId}
                      />
                    </Pressable>
                  </ScrollAnchor>
                ) : null}
                {boardRows.map((row, index) => {
                  if (row.type === "day") {
                    return (
                      <CommunityDayDivider
                        accessibilityLabel={row.accessibilityLabel}
                        first={index === 0 && !pinnedPost}
                        key={row.key}
                        label={row.label}
                      />
                    );
                  }
                  const previous = boardRows[index - 1];
                  const cardStyle = previous?.type === "day" ? undefined : styles.paneCardPress;
                  if (row.item.kind === "general") {
                    const post = row.item;
                    const selected = post.id === (generalDetail?.id ?? openSessionId);
                    return (
                      <ScrollAnchor id={post.id} key={row.key}>
                        <Pressable
                          accessibilityLabel={generalPostFeedCardLabel(isOwnPost(post.userId, viewerUserId))}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => openGeneralPostDetail(post)}
                          style={cardStyle}
                        >
                          <GeneralPostSummaryCard
                            menuItems={generalMenu(post)}
                            onOpenWhoReacted={(type) => openWhoReacted({ focus: type, postId: post.id })}
                            onToggleReaction={(type) => void toggleCardReaction(post, type)}
                            post={post}
                            reactionPending={reactionPendingId === post.id}
                            selected={selected}
                            showCommentCount
                            showReactionSummary
                            timestamp={row.timestamp}
                            viewerUserId={viewerUserId}
                          />
                        </Pressable>
                      </ScrollAnchor>
                    );
                  }
                  const workout = row.item;
                  const selected = !generalDetail && workout.id === openSessionId;
                  const isOwn = isOwnPost(workout.userId, viewerUserId);
                  const title = workout.name?.trim() || workout.title;
                  return (
                    <ScrollAnchor id={workout.id} key={row.key}>
                      <Pressable
                        accessibilityLabel={workoutFeedCardLabel({ isOwn, title })}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => openWorkoutDetail(workout)}
                        style={cardStyle}
                      >
                        <WorkoutSummaryCard
                          isOwn={isOwn}
                          menuItems={feedMenu(workout)}
                          onOpenWhoReacted={(type) => openWhoReacted({
                            focus: type,
                            postId: workout.communityPostId,
                            sessionId: workout.id,
                          })}
                          onToggleReaction={(type) => void toggleCardReaction(workout, type)}
                          reactionPending={reactionPendingId === workout.id}
                          selected={selected}
                          showCommentCount
                          showReactionSummary
                          timestamp={row.timestamp}
                          variant="full"
                          workout={workout}
                        />
                      </Pressable>
                    </ScrollAnchor>
                  );
                })}
                <CommunityBoardPager
                  hasItems={mixedFeed.length > 0 || Boolean(pinnedPost)}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  nextCursor={board?.nextCursor ?? null}
                  onRetry={() => void loadMoreCommunity()}
                />
              </View>
            )}
            right={paneParam ? (
              <CommunityContextBody
                compactTitle
                groupId={selectedGroup.id}
                onOpenPost={(input) => {
                  router.setParams({ pane: "", post: input.sessionId ?? input.postId });
                }}
                pane={paneParam}
              />
            ) : generalDetail ? (
              <GeneralPostDetailView
                groupId={selectedGroup.id}
                onOpenWhoReacted={(type) => openWhoReacted({ focus: type, postId: generalDetail.id })}
                paneHeader={(
                  <View style={styles.panePostHeader}>
                    <Text style={styles.panePostTitle}>Post</Text>
                    <Text style={styles.panePostFrom}>from {selectedGroup.name}</Text>
                  </View>
                )}
                post={generalDetail}
                presentation="community-pane"
                viewerUserId={viewerUserId}
              />
            ) : openSessionId === null ? (
              <View style={[styles.paneEmpty, { paddingBottom: insets.bottom }]}>
                <CheckInEmptyContent onCheckIn={openWorkoutChooser} />
              </View>
            ) : (
              <WorkoutDetailView
                key={openSessionId}
                fixture={previewFixture}
                groupId={selectedGroup.id}
                onPostHidden={(sessionId) => hideFeedItems((item) => communityFeedItemMatchesId(item, sessionId))}
                onUserBlocked={(userId) => hideFeedItems((item) => item.userId === userId)}
                paneHeader={(
                  <View style={styles.panePostHeader}>
                    <Text style={styles.panePostTitle}>Post</Text>
                    <Text style={styles.panePostFrom}>from {selectedGroup.name}</Text>
                  </View>
                )}
                presentation="community-pane"
                seedWorkout={workouts.find((workout) => workout.id === openSessionId)}
                sessionId={openSessionId}
                onCommentCountChange={updateFeedCommentCount}
                onEditWorkout={editWorkout}
                onGoalBadgesChange={updateFeedGoalBadges}
                onOpenWhoReacted={(type) => openWhoReacted({
                  focus: type,
                  sessionId: openSessionId ?? undefined,
                })}
                onPrBadgesChange={updateFeedPrBadges}
                onReactionSummaryChange={updateFeedReactionSummary}
              />
            )}
          />
        </View>
        {moderation.ui}
        <PrUndoToast
          message={goalToastVisible ? goalCopy.toast : prCopy.toast}
          onClear={goalToastVisible ? clearGoalToast : clearPrToast}
          onUndo={() => void (goalToastVisible ? undoGoalBadge() : undoPrBadge())}
          undoLabel={goalToastVisible ? goalCopy.toastUndo : prCopy.toastUndo}
          visible={prToastVisible || goalToastVisible}
        />
        <DeleteWorkoutModal
          error={deleteError}
          onDeletePost={() => void deleteWorkout("post")}
          onDeleteWorkout={() => {
            if (deleteStage === "choose") setDeleteStage("confirm-workout");
            else void deleteWorkout("workout");
          }}
          onDismiss={() => {
            if (deletePending) return;
            setDeleteTarget(null);
            setDeleteStage("choose");
            setDeleteError(null);
          }}
          pending={deletePending}
          stage={deleteStage}
          visible={deleteTarget !== null}
        />
        <ConfirmSheet
          body={formatDeletePostBody(deleteCrewNames)}
          confirmLabel={generalPostCopy.deleteAction}
          onConfirm={() => {
            void (async () => {
              if (!generalDelete || !selectedGroup || !supabase) return;
              const { data: auth } = await supabase.auth.getSession();
              if (!auth.session) return;
              await deleteGeneralPost({
                accessToken: auth.session.access_token,
                groupId: selectedGroup.id,
                postId: generalDelete.id,
              });
              hideFeedItems((item) => communityFeedItemMatchesId(item, generalDelete.id));
              setGeneralDelete(null);
              setDeleteCrewNames([]);
              if (generalDetail?.id === generalDelete.id) {
                setGeneralDetail(null);
                if (postParam === generalDelete.id) router.setParams({ post: "" });
              }
              markWorkoutDataStale();
              void loadCommunity();
            })();
          }}
          onDismiss={() => {
            setGeneralDelete(null);
            setDeleteCrewNames([]);
          }}
          title={generalPostCopy.deleteTitle}
          visible={generalDelete !== null}
        />
        <ConfirmSheet
          body={replacePin
            ? formatReplacePinBody(selectedGroup?.name ?? "this crew")
            : formatPinBody(selectedGroup?.name ?? "this crew")}
          confirmLabel={replacePin ? generalPostCopy.replacePinAction : generalPostCopy.pinAction}
          confirmVariant="primary"
          onConfirm={() => {
            void (async () => {
              if (!pinTarget || !selectedGroup || !supabase) return;
              const { data: auth } = await supabase.auth.getSession();
              if (!auth.session) return;
              try {
                await pinGeneralPost({
                  accessToken: auth.session.access_token,
                  groupId: selectedGroup.id,
                  postId: pinTarget.id,
                  replace: replacePin,
                });
                setPinTarget(null);
                setReplacePin(false);
                markWorkoutDataStale();
                void loadCommunity();
              } catch (pinError) {
                const status = (pinError as { status?: number }).status;
                if (status === 409 && !replacePin) {
                  setReplacePin(true);
                  return;
                }
                setPinTarget(null);
              }
            })();
          }}
          onDismiss={() => {
            setPinTarget(null);
            setReplacePin(false);
          }}
          title={replacePin ? generalPostCopy.replacePinTitle : generalPostCopy.pinTitle}
          visible={pinTarget !== null}
        />
        <PrUndoToast
          contained
          message={generalPostCopy.unpinToast}
          onClear={() => setUnpinToast(null)}
          onUndo={() => {
            const item = unpinToast;
            setUnpinToast(null);
            if (item) restoreUnpinnedPost(item);
          }}
          visible={unpinToast !== null && !prToastVisible && !goalToastVisible}
        />
        <CrewSwitcherSheet
          groups={board?.groups ?? []}
          onDismiss={() => setSwitcherOpen(false)}
          onOpenCrew={() => {
            setSwitcherOpen(false);
            if (selectedGroup) router.push(`/groups/${selectedGroup.id}`);
          }}
          onSelectGroup={(groupId) => {
            if (selectedGroup && communitySelectionClears({
              nextDayKey: "mixed",
              nextGroupId: groupId,
              previousDayKey: "mixed",
              previousGroupId: selectedGroup.id,
            })) clearPostSelection();
            clearFeed(groupId);
            setSelectedGroupId(groupId);
            setSwitcherOpen(false);
          }}
          selectedGroupId={selectedGroup.id}
          visible={switcherOpen}
        />
        <WhoReactedSheet
          data={whoReacted.status === "open" ? whoReacted.data : null}
          error={whoReacted.status === "open" ? whoReacted.error : null}
          focus={whoReacted.status === "open" ? whoReacted.focus : undefined}
          loading={whoReacted.status === "open" && whoReacted.loading}
          onDismiss={() => dispatchWhoReacted({ type: "close" })}
          onRetry={() => void loadWhoReacted()}
          visible={whoReacted.status === "open"}
        />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, tabScreenTopStyle(insets.top)]}>
    <SafeAreaView edges={["left", "right"]} style={styles.flex}>
      <WideColumn fill>
      <View style={styles.content}>
        {selectedGroup ? (
          <ScrollView
            contentContainerStyle={styles.mixedFeed}
            onContentSizeChange={compactScroll.onContentSizeChange}
            onLayout={compactScroll.onViewportLayout}
            onScroll={(event) => {
              compactScroll.onScroll(event);
              handleBoardScroll(event);
            }}
            ref={compactScroll.scrollRef}
            scrollEventThrottle={16}
            style={styles.flex}
          >
            <View collapsable={false} ref={compactScroll.contentRef}>
            <ScrollAnchorProvider contentRef={compactScroll.contentRef} onItemLayout={compactScroll.onItemLayout} pane={null}>
            <ScrollAnchor id="community-header">
              <CommunityBoardHeader
                compact={communityHeaderIsCompact(mode)}
                entryRow={entryRows}
                memberCount={board?.crew?.memberCount ?? selectedGroup.memberCount ?? 1}
                newPostGap={newPostGap}
                onNewPost={openNewPost}
                onOpenCrew={() => router.push(`/groups/${selectedGroup.id}`)}
                onOpenSwitcher={() => setSwitcherOpen(true)}
                onRetryStale={() => void loadCommunity()}
                photoUrl={board?.crew?.photoUrl ?? selectedGroup.photoUrl}
                selectedGroup={selectedGroup}
                staleAt={staleAt}
              />
            </ScrollAnchor>
            {loading && !(mixedFeed.length || pinnedPost) ? (
              <View style={styles.feedState}><LoadingState message="Loading activity…" /></View>
            ) : error && !(mixedFeed.length || pinnedPost) ? (
              <View style={styles.feedState}><StateCard actionLabel={generalPostCopy.tryAgain} message={error} onAction={() => void loadCommunity()} title={generalPostCopy.loadErrorTitle} /></View>
            ) : mixedFeed.length || pinnedPost ? (
              <>
                {offline ? <Text style={styles.offline}>{generalPostCopy.offline}</Text> : null}
                {pinnedPost ? (
                  <ScrollAnchor id={pinnedPost.id}>
                    <Pressable
                      accessibilityLabel={generalPostFeedCardLabel(isOwnPost(pinnedPost.userId, viewerUserId))}
                      accessibilityRole="button"
                      onPress={() => openGeneralPostDetail(pinnedPost)}
                    >
                      <GeneralPostSummaryCard
                        isPinned
                        menuItems={generalMenu(pinnedPost)}
                        onOpenWhoReacted={(type) => openWhoReacted({ focus: type, postId: pinnedPost.id })}
                        onToggleReaction={(type) => void toggleCardReaction(pinnedPost, type)}
                        post={pinnedPost}
                        reactionPending={reactionPendingId === pinnedPost.id}
                        showCommentCount
                        showReactionSummary
                        timestamp={pinnedTimestamp ?? undefined}
                        viewerUserId={viewerUserId}
                      />
                    </Pressable>
                  </ScrollAnchor>
                ) : null}
                {boardRows.map((row, index) => {
                  if (row.type === "day") {
                    return (
                      <CommunityDayDivider
                        accessibilityLabel={row.accessibilityLabel}
                        first={index === 0 && !pinnedPost}
                        key={row.key}
                        label={row.label}
                      />
                    );
                  }
                  const previous = boardRows[index - 1];
                  if (row.item.kind === "general") {
                    const post = row.item;
                    return (
                      <ScrollAnchor id={post.id} key={row.key}>
                        <Pressable
                          accessibilityLabel={generalPostFeedCardLabel(isOwnPost(post.userId, viewerUserId))}
                          accessibilityRole="button"
                          onPress={() => openGeneralPostDetail(post)}
                          style={previous?.type === "day" ? undefined : styles.feedPost}
                        >
                          <GeneralPostSummaryCard
                            menuItems={generalMenu(post)}
                            onOpenWhoReacted={(type) => openWhoReacted({ focus: type, postId: post.id })}
                            onToggleReaction={(type) => void toggleCardReaction(post, type)}
                            post={post}
                            reactionPending={reactionPendingId === post.id}
                            showCommentCount
                            showReactionSummary
                            timestamp={row.timestamp}
                            viewerUserId={viewerUserId}
                          />
                        </Pressable>
                      </ScrollAnchor>
                    );
                  }
                  const workout = row.item;
                  const isOwn = isOwnPost(workout.userId, viewerUserId);
                  const title = workout.name?.trim() || workout.title;
                  return (
                    <ScrollAnchor id={workout.id} key={row.key}>
                      <Pressable
                        accessibilityLabel={workoutFeedCardLabel({ isOwn, title })}
                        accessibilityRole="button"
                        onPress={() => openWorkoutDetail(workout)}
                        style={previous?.type === "day" ? undefined : styles.feedPost}
                      >
                        <WorkoutSummaryCard
                          isOwn={isOwn}
                          menuItems={feedMenu(workout)}
                          onOpenWhoReacted={(type) => openWhoReacted({
                            focus: type,
                            postId: workout.communityPostId,
                            sessionId: workout.id,
                          })}
                          onToggleReaction={(type) => void toggleCardReaction(workout, type)}
                          reactionPending={reactionPendingId === workout.id}
                          selected={false}
                          showCommentCount
                          showReactionSummary
                          timestamp={row.timestamp}
                          variant="full"
                          workout={workout}
                        />
                      </Pressable>
                    </ScrollAnchor>
                  );
                })}
                <CommunityBoardPager
                  hasItems={mixedFeed.length > 0 || Boolean(pinnedPost)}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  nextCursor={board?.nextCursor ?? null}
                  onRetry={() => void loadMoreCommunity()}
                />
              </>
            ) : (
              <View style={styles.todayEmpty}>
                <StateCard message="" title={formatEmptyBoard(selectedGroup.name)} />
              </View>
            )}
            </ScrollAnchorProvider>
            </View>
          </ScrollView>
        ) : (
          <StateCard actionLabel="Join a crew" message="Join or create a crew to start training with your community." onAction={() => router.push("/groups/join")} title="Find your crew" />
        )}
      </View>
      </WideColumn>
      {moderation.ui}
      <WorkoutDetailModal
        key={detailTarget?.workout.id ?? generalDetail?.id ?? "closed"}
        fixture={layoutPreview && detailTarget ? layoutPreviewDetail(detailTarget.workout.id) : null}
        generalPost={detailTarget ? null : generalDetail}
        groupId={detailTarget?.groupId ?? selectedGroup?.id ?? generalDetail?.groupId ?? null}
        groupName={selectedGroup?.name ?? null}
        initialWorkout={detailTarget?.workout ?? null}
        viewerUserId={viewerUserId}
        onCommentCountChange={updateFeedCommentCount}
        onEditWorkout={editWorkout}
        onPostHidden={(sessionId) => hideFeedItems((item) => communityFeedItemMatchesId(item, sessionId))}
        onGoalBadgesChange={updateFeedGoalBadges}
        onPrBadgesChange={updateFeedPrBadges}
        onUserBlocked={(userId) => hideFeedItems((item) => item.userId === userId)}
        onDismiss={() => {
          setDetailTarget(null);
          setExplicitOverride(null);
          setGeneralDetail(null);
          if (postParam) router.setParams({ post: "" });
        }}
        onOpenWhoReacted={(type) => openWhoReacted({
          focus: type,
          postId: generalDetail?.id,
          sessionId: detailTarget?.workout.id,
        })}
        onReactionSummaryChange={updateFeedReactionSummary}
        sessionId={detailTarget?.workout.id ?? null}
        visible={detailTarget !== null || generalDetail !== null}
      />
      <PrUndoToast
        message={goalToastVisible ? goalCopy.toast : prCopy.toast}
        onClear={goalToastVisible ? clearGoalToast : clearPrToast}
        onUndo={() => void (goalToastVisible ? undoGoalBadge() : undoPrBadge())}
        undoLabel={goalToastVisible ? goalCopy.toastUndo : prCopy.toastUndo}
        visible={prToastVisible || goalToastVisible}
      />
      <DeleteWorkoutModal
        error={deleteError}
        onDeletePost={() => void deleteWorkout("post")}
        onDeleteWorkout={() => {
          if (deleteStage === "choose") setDeleteStage("confirm-workout");
          else void deleteWorkout("workout");
        }}
        onDismiss={() => {
          if (deletePending) return;
          setDeleteTarget(null);
          setDeleteStage("choose");
          setDeleteError(null);
        }}
        pending={deletePending}
        stage={deleteStage}
        visible={deleteTarget !== null}
      />
      <ConfirmSheet
        body={formatDeletePostBody(deleteCrewNames)}
        confirmLabel={generalPostCopy.deleteAction}
        onConfirm={() => {
          void (async () => {
            if (!generalDelete || !selectedGroup || !supabase) return;
            const { data: auth } = await supabase.auth.getSession();
            if (!auth.session) return;
            await deleteGeneralPost({
              accessToken: auth.session.access_token,
              groupId: selectedGroup.id,
              postId: generalDelete.id,
            });
            hideFeedItems((item) => communityFeedItemMatchesId(item, generalDelete.id));
            setGeneralDelete(null);
            setDeleteCrewNames([]);
            if (generalDetail?.id === generalDelete.id) {
              setGeneralDetail(null);
              if (postParam === generalDelete.id) router.setParams({ post: "" });
            }
            markWorkoutDataStale();
            void loadCommunity();
          })();
        }}
        onDismiss={() => {
          setGeneralDelete(null);
          setDeleteCrewNames([]);
        }}
        title={generalPostCopy.deleteTitle}
        visible={generalDelete !== null}
      />
      <ConfirmSheet
        body={replacePin
          ? formatReplacePinBody(selectedGroup?.name ?? "this crew")
          : formatPinBody(selectedGroup?.name ?? "this crew")}
        confirmLabel={replacePin ? generalPostCopy.replacePinAction : generalPostCopy.pinAction}
        confirmVariant="primary"
        onConfirm={() => {
          void (async () => {
            if (!pinTarget || !selectedGroup || !supabase) return;
            const { data: auth } = await supabase.auth.getSession();
            if (!auth.session) return;
            try {
              await pinGeneralPost({
                accessToken: auth.session.access_token,
                groupId: selectedGroup.id,
                postId: pinTarget.id,
                replace: replacePin,
              });
              setPinTarget(null);
              setReplacePin(false);
              markWorkoutDataStale();
              void loadCommunity();
            } catch (pinError) {
              const status = (pinError as { status?: number }).status;
              if (status === 409 && !replacePin) {
                setReplacePin(true);
                return;
              }
              setPinTarget(null);
            }
          })();
        }}
        onDismiss={() => {
          setPinTarget(null);
          setReplacePin(false);
        }}
        title={replacePin ? generalPostCopy.replacePinTitle : generalPostCopy.pinTitle}
        visible={pinTarget !== null}
      />
      <PrUndoToast
        contained={mode === "twoPane"}
        message={generalPostCopy.unpinToast}
        onClear={() => setUnpinToast(null)}
        onUndo={() => {
          const item = unpinToast;
          setUnpinToast(null);
          if (item) restoreUnpinnedPost(item);
        }}
        visible={unpinToast !== null && !prToastVisible && !goalToastVisible}
      />
      {selectedGroup ? (
        <CrewSwitcherSheet
          groups={board?.groups ?? []}
          onDismiss={() => setSwitcherOpen(false)}
          onOpenCrew={() => {
            setSwitcherOpen(false);
            router.push(`/groups/${selectedGroup.id}`);
          }}
          onSelectGroup={(groupId) => {
            if (communitySelectionClears({
              nextDayKey: "mixed",
              nextGroupId: groupId,
              previousDayKey: "mixed",
              previousGroupId: selectedGroup.id,
            })) clearPostSelection();
            clearFeed(groupId);
            setSelectedGroupId(groupId);
            setSwitcherOpen(false);
          }}
          selectedGroupId={selectedGroup.id}
          visible={switcherOpen}
        />
      ) : null}
      <WhoReactedSheet
        data={whoReacted.status === "open" ? whoReacted.data : null}
        error={whoReacted.status === "open" ? whoReacted.error : null}
        focus={whoReacted.status === "open" ? whoReacted.focus : undefined}
        loading={whoReacted.status === "open" && whoReacted.loading}
        onDismiss={() => dispatchWhoReacted({ type: "close" })}
        onRetry={() => void loadWhoReacted()}
        visible={whoReacted.status === "open"}
      />
    </SafeAreaView>
    </View>
  );
}

function CommunityBoardPager({
  hasItems,
  loadingMore,
  loadMoreError,
  nextCursor,
  onRetry,
}: {
  hasItems: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  nextCursor: string | null;
  onRetry: () => void;
}) {
  if (loadingMore) {
    return (
      <View style={styles.pager}>
        <LoadingState message={generalPostCopy.loadingMore} />
      </View>
    );
  }
  if (loadMoreError) {
    return (
      <View style={styles.pager}>
        <StateCard
          actionLabel={generalPostCopy.tryAgain}
          message={loadMoreError}
          onAction={onRetry}
          title={generalPostCopy.loadMoreErrorTitle}
        />
      </View>
    );
  }
  if (hasItems && !nextCursor) {
    return <Text style={styles.end}>{generalPostCopy.endOfBoard}</Text>;
  }
  return null;
}

function DeleteWorkoutModal({
  error,
  onDeletePost,
  onDeleteWorkout,
  onDismiss,
  pending,
  stage,
  visible,
}: {
  error: string | null;
  onDeletePost: () => void;
  onDeleteWorkout: () => void;
  onDismiss: () => void;
  pending: boolean;
  stage: "choose" | "confirm-workout";
  visible: boolean;
}) {
  return (
    <Dialog closeLabel="Cancel deletion" dismissDisabled={pending} onDismiss={onDismiss} visible={visible}>
      <Text style={styles.deleteTitle}>{stage === "choose" ? "Delete workout?" : "Permanently delete workout?"}</Text>
      <Text style={styles.deleteMessage}>{stage === "choose" ? "Choose what you want to remove." : "This removes the workout from your history and every Community post. This cannot be undone."}</Text>
      {stage === "choose" ? (
        <>
          <MenuItem
            detail="Remove this rep-in from the crew. Your workout will stay in your history."
            disabled={pending}
            label="Delete post only"
            onPress={onDeletePost}
          />
          <MenuItem
            danger
            detail="Permanently delete this workout and its Community post."
            disabled={pending}
            label="Delete post and workout"
            onPress={onDeleteWorkout}
          />
        </>
      ) : (
        <Button loading={pending} loadingLabel="Deleting" onPress={onDeleteWorkout} variant="danger">Permanently delete</Button>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.deleteError}>{error}</Text> : null}
      <Button disabled={pending} onPress={onDismiss} variant="secondary">Cancel</Button>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1, overflow: "hidden" },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  pickerBackdrop: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
  groupHeaderRow: { alignItems: "center", flexDirection: "row", marginTop: spacing.xs, minHeight: size.control, zIndex: 20 },
  selectorAnchor: { flexShrink: 1, maxWidth: "100%", position: "relative", zIndex: 21 },
  selector: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: size.hit, paddingRight: spacing.sm },
  groupName: { color: colors.ink, flexShrink: 1, ...type.screenTitle },
  chevron: { marginLeft: spacing.xs },
  groupDrawer: { left: 0, maxWidth: 280, minWidth: 220, position: "absolute", top: "100%", zIndex: 21 },
  dateNavigator: { alignItems: "center", alignSelf: "center", flexDirection: "row", justifyContent: "center", marginTop: spacing.xs },
  dateArrow: { alignItems: "center", justifyContent: "center", minHeight: size.hit, width: size.primary },
  dateArrowDisabled: { opacity: 0.28 },
  dateLabelButton: { alignItems: "center", justifyContent: "center", minHeight: size.hit, minWidth: 128, paddingHorizontal: spacing.md },
  dateLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  boardTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: type.section.fontSize, lineHeight: type.section.lineHeight, marginBottom: 0, marginTop: spacing.sm },
  mixedFeed: { paddingBottom: spacing.huge, paddingTop: 0 },
  feedPost: { marginTop: spacing.md },
  pager: { paddingVertical: spacing.lg },
  end: { color: colors.muted, paddingVertical: spacing.xxl, textAlign: "center", ...type.bodySmall },
  offline: { color: colors.muted, ...type.bodySmall },
  feedState: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  todayEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  historicalEmpty: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  deleteTitle: { color: colors.ink, ...type.title },
  deleteMessage: { color: colors.muted, ...type.bodySmall },
  deleteError: { color: colors.danger, ...type.bodySmall },
  pressed: { opacity: 0.72 },
  paneColumn: { flexGrow: 1, paddingBottom: spacing.xxl },
  paneCardPress: { marginTop: spacing.md },
  paneEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  panePostHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  panePostTitle: { color: colors.ink, ...type.heading },
  panePostFrom: { color: colors.muted, ...type.bodySmall },
});

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function atLocalTime(hours: number, minutes: number, daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function layoutPreviewCommunity(): CommunityData {
  const reactions = { clap: 0, fire: 2, strong: 1 };
  const workout = (
    id: string,
    displayName: string,
    userId: string,
    title: string,
    workoutType: string,
    hours: number,
    minutes: number,
    effort: number,
    caption: string | null,
    resultSummary: string,
    daysAgo = 0,
  ): WorkoutFeedItem => {
    const occurredAt = atLocalTime(hours, minutes, daysAgo);
    return {
      caption,
      commentCount: 1,
      completedAt: occurredAt,
      createdAt: occurredAt,
      kind: "workout",
      displayName,
      durationMinutes: null,
      effort,
      groupId: "group-1",
      id,
      name: title,
      notes: caption,
      occurredAt,
      photoPath: null,
      latestComment: { createdAt: occurredAt, displayName: "Maya L.", text: "Nice pace!" },
      reactionCounts: reactions,
      resultSummary,
      title,
      updatedAt: occurredAt,
      userId,
      workoutType,
    };
  };
  const occurredAt = atLocalTime(8, 5);
  const pinnedAt = atLocalTime(19, 40, 1);
  const generalPost: GeneralPostFeedItem = {
    body: "Recovery day thoughts.",
    commentCount: 1,
    createdAt: occurredAt,
    displayName: "Maya L.",
    editedAt: null,
    groupId: "group-1",
    id: "g1",
    kind: "general",
    links: [],
    photos: [],
    publicationId: "pub-1",
    latestComment: { createdAt: occurredAt, displayName: "Maya L.", text: "Nice pace!" },
    reactionCounts: reactions,
    updatedAt: occurredAt,
    userId: "user-maya",
  };
  const pinnedPost: GeneralPostFeedItem = {
    body: "Crew dinner this Friday.",
    commentCount: 2,
    createdAt: pinnedAt,
    displayName: "Jordan P.",
    editedAt: null,
    groupId: "group-1",
    id: "g-pin",
    kind: "general",
    links: [],
    photos: [],
    publicationId: "pub-pin",
    reactionCounts: reactions,
    updatedAt: pinnedAt,
    userId: "user-jordan",
  };
  const communityWorkouts = [
    workout("w1", "Maya L.", "user-maya", "Easy shakeout", "run", 7, 12, 4, "Legs felt great today", "5 km Run"),
    workout("w2", "Jordan P.", "user-jordan", "Push day", "strength_training", 6, 40, 4, null, "45 min Strength Training"),
    workout("w3", "Sam R.", "user-sam", "Hill repeats", "run", 6, 5, 4, null, "8 km Run", 2),
  ];
  return {
    communityFeed: [generalPost, ...communityWorkouts],
    pinnedPost,
    communityWorkouts,
    crew: {
      activityCount: 2,
      highlightCount: 4,
      memberCount: 6,
      photoUrl: null,
      weekPulse: { activeMembers: 4, sharedWorkouts: 18 },
    },
    groups: [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "group-1",
      memberCount: 6,
      name: "Morning Crew",
      ownerId: "user-maya",
      role: "owner",
    }],
    selectedGroupId: "group-1",
  };
}

function layoutPreviewDetail(sessionId: string): WorkoutDetailFixture | null {
  const workout = layoutPreviewCommunity().communityWorkouts.find((item) => item.id === sessionId);
  if (!workout) return null;
  const counts = workout.reactionCounts ?? { clap: 0, fire: 0, strong: 0 };
  const detail: CommunityWorkoutDetail = {
    ...workout,
    communityPostId: `post-${workout.id}`,
    metrics: workout.id === "w1" ? [{
      id: "metric-distance",
      label: "Distance",
      metricType: "distance",
      numericValue: 5,
      position: 0,
      textValue: null,
      unit: "km",
    }] : [],
    movements: [],
    reactions: {
      counts,
      total: counts.fire + counts.strong + counts.clap,
      viewerReaction: null,
    },
    segments: [],
    workoutSubtype: null,
  };
  const commentAt = atLocalTime(15, 36);
  const comments: CommunityPostComment[] = workout.id === "w1" ? [{
    createdAt: commentAt,
    displayName: "repin member",
    id: "comment-1",
    text: "See you tomorrow.",
    updatedAt: commentAt,
    userId: "user-jordan",
  }] : [];
  return { comments, workout: detail };
}
