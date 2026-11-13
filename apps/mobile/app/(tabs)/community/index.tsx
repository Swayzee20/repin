import type { CommunityData, CommunityFeedItem, CommunityPostComment, CommunityReactionSummary, CommunityWorkoutDetail, GeneralPostFeedItem, GoalBadge, GroupSummary, PrBadge, WorkoutFeedItem } from "@repin/types";
import {
  formatDeletePostBody,
  formatEmptyBoard,
  formatPinBody,
  formatReplacePinBody,
  generalPostCopy,
  goalCopy,
} from "@repin/validation";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
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
  communityFoldTransition,
  communitySelectionClears,
  readCommunityPostParam,
  resolveCommunityGeneralPost,
  resolveCommunitySelection,
} from "../../../lib/community-selection";
import { generalPostFeedCardLabel, isOwnPost, workoutFeedCardLabel } from "../../../ui/community-feed-layout";
import { BrandHeader, Button, LoadingState, StateCard, WorkoutSummaryCard } from "../../../ui/components";
import { ConfirmSheet } from "../../../ui/crew-sheets";
import { GeneralPostSummaryCard } from "../../../ui/general-post-card";
import { GeneralPostDetailView } from "../../../ui/general-post-detail";
import { prCopy } from "../../../ui/pr-copy";
import { PrUndoToast } from "../../../ui/pr-undo-toast";
import { Dialog } from "../../../ui/dialog";
import { Chevron } from "../../../ui/icons";
import { TwoPane, useLayoutMode, WideColumn } from "../../../ui/layout";
import { Menu, MenuItem } from "../../../ui/menu";
import { CheckInEmptyContent } from "../../../ui/check-in-empty-content";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { ScrollAnchor } from "../../../ui/scroll-anchor";
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
  const params = useLocalSearchParams<{ groupId?: string | string[]; post?: string | string[] }>();
  const postParam = readCommunityPostParam(params.post);
  const groupParam = readCommunityPostParam(params.groupId);
  const { mode } = useLayoutMode();
  const layoutPreview = __DEV__ && isLayoutPreview();
  const { openWorkoutChooser, selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(!layoutPreview);
  const [error, setError] = useState<string | null>(null);
  const [groupMenuView, setGroupMenuView] = useState<"actions" | "groups" | null>(null);
  const [boardHeight, setBoardHeight] = useState(0);
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
    }

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
        timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
        view: "community",
        feed: "mixed",
      });
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as CommunityData & { error?: string };
      if (!response.ok) throw new Error(generalPostCopy.loadErrorTitle);
      setOffline(false);
      if (latestRequestKey.current !== requestKey) return;
      dataRef.current = body;
      loadedUserId.current = auth.session.user.id;
      lastSuccessfulLoad.current = {
        key: `community:${auth.session.user.id}:${body.selectedGroupId ?? "none"}:mixed`,
        loadedAt: Date.now(),
        workoutRevision,
      };
      setData(body);
      setSelectedGroupId(body.selectedGroupId);
      } catch (loadError) {
        if (latestRequestKey.current === requestKey) {
          const message = loadError instanceof Error ? loadError.message : generalPostCopy.loadErrorTitle;
          if (dataRef.current) {
            setOffline(true);
            setError(null);
          } else {
            setError(message === "Failed to fetch" || /network|offline/i.test(message)
              ? generalPostCopy.offline
              : generalPostCopy.loadErrorTitle);
          }
        }
      } finally {
        if (latestRequestKey.current === requestKey) setLoading(false);
      }
    })().finally(() => inFlightRequests.current.delete(requestKey));
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [selectedGroupId, setSelectedGroupId]);

  const previewBoard = useMemo(() => (layoutPreview ? layoutPreviewCommunity() : null), [layoutPreview]);
  const board = previewBoard ?? data;
  const workouts = useMemo(() => board?.communityWorkouts ?? [], [board]);
  const mixedFeed = useMemo<CommunityFeedItem[]>(
    () => board?.communityFeed ?? workouts.map((workout) => ({ ...workout, kind: "workout" as const })),
    [board, workouts],
  );
  const pinnedPost = board?.pinnedPost ?? null;
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

  const hideWorkouts = useCallback((matches: (workout: WorkoutFeedItem) => boolean) => {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.filter((workout) => !matches(workout)),
      };
      dataRef.current = next;
      return next;
    });
    setDetailTarget((current) => {
      if (!current || !matches(current.workout)) return current;
      setExplicitOverride(null);
      if (postParam) router.setParams({ post: "" });
      return null;
    });
  }, [postParam, router]);

  const moderation = useModeration({
    onPostHidden: (sessionId) => hideWorkouts((workout) => workout.id === sessionId),
    onUserBlocked: (userId) => hideWorkouts((workout) => workout.userId === userId),
  });

  const clearFeed = useCallback((nextGroupId?: string | null) => {
    latestRequestKey.current = null;
    setError(null);
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        selectedGroupId: nextGroupId === undefined ? current.selectedGroupId : nextGroupId,
        communityWorkouts: [],
      };
      dataRef.current = next;
      return next;
    });
  }, []);

  useFocusEffect(useCallback(() => {
    if (layoutPreview) return;
    void loadCommunity();
  }, [layoutPreview, loadCommunity]));

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height);
    setBoardHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
  }, []);

  const openWorkoutDetail = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    setGroupMenuView(null);
    setGeneralDetail(null);
    if (mode === "twoPane") {
      setExplicitOverride(workout.id);
      router.setParams({ post: workout.id });
      return;
    }
    setDetailTarget({ groupId: selectedGroup.id, workout });
  }, [mode, router, selectedGroup]);

  const openGeneralPostDetail = useCallback((post: GeneralPostFeedItem) => {
    if (!selectedGroup) return;
    setGroupMenuView(null);
    setDetailTarget(null);
    if (mode === "twoPane") {
      setGeneralDetail(post);
      setExplicitOverride(post.id);
      router.setParams({ post: post.id });
      return;
    }
    setGeneralDetail(post);
  }, [mode, router, selectedGroup]);

  const updateFeedReactionSummary = useCallback((sessionId: string, reactions: CommunityReactionSummary) => {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, reactionCounts: reactions.counts } : workout,
        ),
      };
      dataRef.current = next;
      return next;
    });
  }, []);

  const updateFeedCommentCount = useCallback((sessionId: string, commentCount: number) => {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, commentCount } : workout,
        ),
      };
      dataRef.current = next;
      return next;
    });
  }, []);

  const updateFeedPrBadges = useCallback((sessionId: string, prBadges: PrBadge[]) => {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, prBadges } : workout,
        ),
      };
      dataRef.current = next;
      return next;
    });
    setDetailTarget((current) => current?.workout.id === sessionId
      ? { ...current, workout: { ...current.workout, prBadges } }
      : current);
  }, []);
  const {
    clear: clearPrToast,
    remove: removePrBadge,
    undo: undoPrBadge,
    visible: prToastVisible,
  } = usePrBadgeUndo(updateFeedPrBadges);

  const updateFeedGoalBadges = useCallback((sessionId: string, goalBadges: GoalBadge[]) => {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, goalBadges } : workout,
        ),
      };
      dataRef.current = next;
      return next;
    });
    setDetailTarget((current) => current?.workout.id === sessionId
      ? { ...current, workout: { ...current.workout, goalBadges } }
      : current);
  }, []);
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
      setData((current) => {
        if (!current) return current;
        const next = { ...current, communityWorkouts: current.communityWorkouts.filter((workout) => workout.id !== deleteTarget.id) };
        dataRef.current = next;
        return next;
      });
      setDeleteTarget(null);
      setDeleteStage("choose");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Workout could not be deleted.");
    } finally {
      setDeletePending(false);
    }
  }, [clearPostSelection, deleteTarget, detailTarget?.workout.id, explicitOverride, postParam, selectedGroup]);

  if (!layoutPreview && loading && !data) return <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}><WideColumn fill><LoadingState message="Loading Community…" /></WideColumn></SafeAreaView>;
  if (!layoutPreview && error && !data) return <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}><WideColumn fill><View style={styles.state}><StateCard actionLabel="Try again" message={error} onAction={() => void loadCommunity()} title="Community unavailable" /></View></WideColumn></SafeAreaView>;

  const previewFixture = layoutPreview && selection.kind !== "none" ? layoutPreviewDetail(selection.sessionId) : null;
  const openSessionId = selection.kind === "none" ? null : selection.sessionId;
  const viewerUserId = layoutPreview ? layoutPreviewViewerUserId : loadedUserId.current;

  if (mode === "twoPane" && selectedGroup) {
    return (
      <View style={styles.safeArea}>
        <SafeAreaView edges={["top"]} style={styles.flex}>
          <TwoPane
            fallback="hide-right"
            keyboardShouldPersistTaps="handled"
            leftAnchorKey={communityFeedAnchorKey}
            scrollableRight={false}
            left={(
              <View style={styles.paneColumn}>
                {groupMenuView ? (
                  <Pressable
                    accessibilityLabel="Close group menu"
                    accessibilityRole="button"
                    onPress={() => setGroupMenuView(null)}
                    style={styles.pickerBackdrop}
                  />
                ) : null}
                <ScrollAnchor id="community-header">
                  <BrandHeader />
                  <CommunityGroupControls
                    groupMenuView={groupMenuView}
                    groups={board?.groups ?? []}
                    onOpenGroup={(groupId) => router.push(`/groups/${groupId}`)}
                    onSelectGroup={(groupId) => {
                      if (communitySelectionClears({
                        nextDayKey: "mixed",
                        nextGroupId: groupId,
                        previousDayKey: "mixed",
                        previousGroupId: selectedGroup.id,
                      })) clearPostSelection();
                      clearFeed(groupId);
                      setSelectedGroupId(groupId);
                    }}
                    onToggleMenu={setGroupMenuView}
                    selectedGroup={selectedGroup}
                  />
                </ScrollAnchor>
                <Text style={styles.boardTitle}>Community Board</Text>
                <Button
                  onPress={openNewPost}
                  style={styles.newPost}
                  variant="tonal"
                  labelColor={colors.brandPressed}
                >
                  {generalPostCopy.newPost}
                </Button>
                {pinnedPost ? (
                  <Pressable
                    accessibilityLabel={generalPostFeedCardLabel()}
                    accessibilityRole="button"
                    accessibilityState={{ selected: pinnedPost.id === (generalDetail?.id ?? openSessionId) }}
                    onPress={() => openGeneralPostDetail(pinnedPost)}
                    style={styles.paneCardPress}
                  >
                    <GeneralPostSummaryCard
                      isPinned
                      menuItems={generalMenu(pinnedPost)}
                      post={pinnedPost}
                      selected={pinnedPost.id === (generalDetail?.id ?? openSessionId)}
                      showCommentCount
                      showReactionSummary
                      viewerUserId={viewerUserId}
                    />
                  </Pressable>
                ) : null}
                {mixedFeed.length ? mixedFeed.map((item) => {
                  if (item.kind === "general") {
                    const selected = item.id === (generalDetail?.id ?? openSessionId);
                    return (
                      <ScrollAnchor id={item.id} key={item.id}>
                        <Pressable
                          accessibilityLabel={generalPostFeedCardLabel()}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => openGeneralPostDetail(item)}
                          style={styles.paneCardPress}
                        >
                          <GeneralPostSummaryCard
                            menuItems={generalMenu(item)}
                            post={item}
                            selected={selected}
                            showCommentCount
                            showReactionSummary
                            viewerUserId={viewerUserId}
                          />
                        </Pressable>
                      </ScrollAnchor>
                    );
                  }
                  const workout = item;
                  const selected = !generalDetail && workout.id === openSessionId;
                  const isOwn = isOwnPost(workout.userId, viewerUserId);
                  const title = workout.name?.trim() || workout.title;
                  return (
                    <ScrollAnchor id={workout.id} key={workout.id}>
                      <Pressable
                        accessibilityLabel={workoutFeedCardLabel({ title })}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => openWorkoutDetail(workout)}
                        style={styles.paneCardPress}
                      >
                        <WorkoutSummaryCard
                          isOwn={isOwn}
                          menuItems={feedMenu(workout)}
                          selected={selected}
                          showCommentCount
                          showReactionSummary
                          variant="full"
                          workout={workout}
                        />
                      </Pressable>
                    </ScrollAnchor>
                  );
                }) : null}
              </View>
            )}
            right={generalDetail ? (
              <GeneralPostDetailView
                groupId={selectedGroup.id}
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
                onPostHidden={(sessionId) => hideWorkouts((workout) => workout.id === sessionId)}
                onUserBlocked={(userId) => hideWorkouts((workout) => workout.userId === userId)}
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
                onPrBadgesChange={updateFeedPrBadges}
                onReactionSummaryChange={updateFeedReactionSummary}
              />
            )}
          />
        </SafeAreaView>
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
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
    <SafeAreaView edges={["top", "left", "right"]} style={styles.flex}>
      <WideColumn fill>
      <View style={styles.content}>
        <BrandHeader />

        {selectedGroup ? (
          <>
            {groupMenuView ? (
              <Pressable
                accessibilityLabel="Close group menu"
                accessibilityRole="button"
                onPress={() => setGroupMenuView(null)}
                style={styles.pickerBackdrop}
              />
            ) : null}
            <View style={styles.groupHeaderRow}>
              <View style={styles.selectorAnchor}>
                <Pressable
                  accessibilityLabel={`Selected group: ${selectedGroup.name}. Open group menu`}
                  accessibilityRole="button"
                  onPress={() => setGroupMenuView((view) => view ? null : "actions")}
                  style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.groupName}>{selectedGroup.name}</Text>
                  <View style={styles.chevron}><Chevron color={colors.brand} direction={groupMenuView ? "up" : "down"} /></View>
                </Pressable>
                {groupMenuView ? (
                  <GroupActionsMenu
                    groupMenuView={groupMenuView}
                    groups={board?.groups ?? []}
                    onOpenGroup={(groupId) => router.push(`/groups/${groupId}`)}
                    onSelectGroup={(groupId) => {
                      if (communitySelectionClears({
                        nextDayKey: "mixed",
                        nextGroupId: groupId,
                        previousDayKey: "mixed",
                        previousGroupId: selectedGroup.id,
                      })) clearPostSelection();
                      clearFeed(groupId);
                      setSelectedGroupId(groupId);
                    }}
                    onToggleMenu={setGroupMenuView}
                    selectedGroupId={selectedGroup.id}
                  />
                ) : null}
              </View>
            </View>

            <Text style={styles.boardTitle}>Community Board</Text>
            <Button
              onPress={openNewPost}
              style={styles.newPost}
              variant="tonal"
              labelColor={colors.brandPressed}
            >
              {generalPostCopy.newPost}
            </Button>

            <View onLayout={handleBoardLayout} style={styles.boardArea}>
              {loading ? (
                <View style={styles.feedState}><LoadingState message="Loading activity…" /></View>
              ) : error ? (
                <View style={styles.feedState}><StateCard actionLabel={generalPostCopy.tryAgain} message={error} onAction={() => void loadCommunity()} title={generalPostCopy.loadErrorTitle} /></View>
              ) : mixedFeed.length || pinnedPost ? (
                boardHeight > 0 ? (
                  <ScrollView style={{ height: boardHeight }} contentContainerStyle={styles.mixedFeed}>
                    {offline ? <Text style={styles.offline}>{generalPostCopy.offline}</Text> : null}
                    {pinnedPost ? (
                      <Pressable
                        accessibilityLabel={generalPostFeedCardLabel()}
                        accessibilityRole="button"
                        onPress={() => openGeneralPostDetail(pinnedPost)}
                      >
                        <GeneralPostSummaryCard
                          isPinned
                          menuItems={generalMenu(pinnedPost)}
                          post={pinnedPost}
                          showCommentCount
                          showReactionSummary
                          viewerUserId={viewerUserId}
                        />
                      </Pressable>
                    ) : null}
                    {mixedFeed.map((item) => {
                      if (item.kind === "general") {
                        return (
                          <Pressable
                            accessibilityLabel={generalPostFeedCardLabel()}
                            accessibilityRole="button"
                            key={item.id}
                            onPress={() => openGeneralPostDetail(item)}
                          >
                            <GeneralPostSummaryCard
                              menuItems={generalMenu(item)}
                              post={item}
                              showCommentCount
                              showReactionSummary
                              viewerUserId={viewerUserId}
                            />
                          </Pressable>
                        );
                      }
                      const workout = item;
                      const isOwn = isOwnPost(workout.userId, viewerUserId);
                      const title = workout.name?.trim() || workout.title;
                      return (
                        <Pressable
                          accessibilityLabel={workoutFeedCardLabel({ title })}
                          accessibilityRole="button"
                          key={workout.id}
                          onPress={() => openWorkoutDetail(workout)}
                        >
                          <WorkoutSummaryCard
                            isOwn={isOwn}
                            menuItems={feedMenu(workout)}
                            selected={false}
                            showCommentCount
                            showReactionSummary
                            variant="full"
                            workout={workout}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null
              ) : (
                <View style={styles.todayEmpty}>
                  <StateCard message="" title={formatEmptyBoard(selectedGroup.name)} />
                </View>
              )}
            </View>
          </>
        ) : (
          <StateCard actionLabel="Join a group" message="Join or create a group to start training with your community." onAction={() => router.push("/groups/join")} title="Find your crew" />
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
        onPostHidden={(sessionId) => hideWorkouts((workout) => workout.id === sessionId)}
        onGoalBadgesChange={updateFeedGoalBadges}
        onPrBadgesChange={updateFeedPrBadges}
        onUserBlocked={(userId) => hideWorkouts((workout) => workout.userId === userId)}
        onDismiss={() => {
          setDetailTarget(null);
          setExplicitOverride(null);
          setGeneralDetail(null);
          if (postParam) router.setParams({ post: "" });
        }}
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
    </SafeAreaView>
    </View>
  );
}

function GroupActionsMenu({
  groupMenuView,
  groups,
  onOpenGroup,
  onSelectGroup,
  onToggleMenu,
  selectedGroupId,
}: {
  groupMenuView: "actions" | "groups";
  groups: GroupSummary[];
  onOpenGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onToggleMenu: (view: "actions" | "groups" | null) => void;
  selectedGroupId: string;
}) {
  return (
    <Menu style={styles.groupDrawer}>
      {groupMenuView === "actions" ? (
        <>
          <MenuItem icon="arrow.triangle.2.circlepath" label="Switch group" onPress={() => onToggleMenu("groups")} showChevron />
          <MenuItem
            icon="person.2"
            label="View group"
            onPress={() => {
              onToggleMenu(null);
              onOpenGroup(selectedGroupId);
            }}
          />
        </>
      ) : (
        <>
          <MenuItem accessibilityLabel="Back to group menu" icon="chevron.left" label="Switch group" onPress={() => onToggleMenu("actions")} />
          {groups.map((group) => (
            <MenuItem
              key={group.id}
              label={group.name}
              onPress={() => {
                onSelectGroup(group.id);
                onToggleMenu(null);
              }}
              selected={group.id === selectedGroupId}
            />
          ))}
        </>
      )}
    </Menu>
  );
}

function CommunityGroupControls({
  groupMenuView,
  groups,
  onOpenGroup,
  onSelectGroup,
  onToggleMenu,
  selectedGroup,
}: {
  groupMenuView: "actions" | "groups" | null;
  groups: GroupSummary[];
  onOpenGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onToggleMenu: (view: "actions" | "groups" | null) => void;
  selectedGroup: GroupSummary;
}) {
  return (
    <>
      <View style={styles.groupHeaderRow}>
        <View style={styles.selectorAnchor}>
          <Pressable
            accessibilityLabel={`Selected group: ${selectedGroup.name}. Open group menu`}
            accessibilityRole="button"
            onPress={() => onToggleMenu(groupMenuView ? null : "actions")}
            style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.groupName}>{selectedGroup.name}</Text>
            <View style={styles.chevron}><Chevron color={colors.brand} direction={groupMenuView ? "up" : "down"} /></View>
          </Pressable>
          {groupMenuView ? (
            <GroupActionsMenu
              groupMenuView={groupMenuView}
              groups={groups}
              onOpenGroup={onOpenGroup}
              onSelectGroup={onSelectGroup}
              onToggleMenu={onToggleMenu}
              selectedGroupId={selectedGroup.id}
            />
          ) : null}
        </View>
      </View>
    </>
  );
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
            detail="Remove this rep-in from the group. Your workout will stay in your history."
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
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
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
  boardTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: type.section.fontSize, lineHeight: type.section.lineHeight, marginBottom: spacing.sm, marginTop: spacing.sm },
  newPost: { alignSelf: "stretch", borderColor: colors.boardBorder, borderWidth: 1, marginBottom: spacing.md, width: "100%" },
  mixedFeed: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.huge },
  offline: { color: colors.muted, ...type.bodySmall },
  // eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size
  boardArea: { backgroundColor: colors.surfaceMuted, borderTopColor: colors.border, borderTopWidth: 1, flex: 1, marginHorizontal: -spacing.xxl, minHeight: 0 },
  feedState: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  todayEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  historicalEmpty: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  deleteTitle: { color: colors.ink, ...type.title },
  deleteMessage: { color: colors.muted, ...type.bodySmall },
  deleteError: { color: colors.danger, ...type.bodySmall },
  pressed: { opacity: 0.72 },
  paneColumn: { flexGrow: 1, paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  paneCardPress: { marginTop: spacing.md },
  paneEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  panePostHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  panePostTitle: { color: colors.ink, ...type.heading },
  panePostFrom: { color: colors.muted, ...type.bodySmall },
});

function atLocalTime(hours: number, minutes: number) {
  const date = new Date();
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
  ): WorkoutFeedItem => {
    const occurredAt = atLocalTime(hours, minutes);
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
      reactionCounts: reactions,
      resultSummary,
      title,
      updatedAt: occurredAt,
      userId,
      workoutType,
    };
  };
  const occurredAt = atLocalTime(8, 5);
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
    reactionCounts: reactions,
    updatedAt: occurredAt,
    userId: "user-maya",
  };
  const communityWorkouts = [
    workout("w1", "Maya L.", "user-maya", "Easy shakeout", "run", 7, 12, 4, "Legs felt great today", "5 km Run"),
    workout("w2", "Jordan P.", "user-jordan", "Push day", "strength_training", 6, 40, 4, null, "45 min Strength Training"),
    workout("w3", "Sam R.", "user-sam", "Hill repeats", "run", 6, 5, 4, null, "8 km Run"),
  ];
  return {
    communityFeed: [generalPost, ...communityWorkouts],
    communityWorkouts,
    groups: [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "group-1",
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
