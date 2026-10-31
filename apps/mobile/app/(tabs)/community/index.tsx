import type { CommunityData, CommunityPostComment, CommunityReactionSummary, CommunityWorkoutDetail, GroupSummary, WorkoutFeedItem } from "@repin/types";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { clearWorkoutDetailCaches } from "../../../lib/workout-detail-cache";
import {
  addLocalDays,
  formatCommunityDayLabel,
  getLocalDayRange,
  isSameLocalDay,
  startOfLocalDay,
  toLocalDateInputValue,
} from "../../../lib/community-date";
import {
  getWorkoutDataRevision,
  isFresh,
  markWorkoutDataStale,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { isLayoutPreview } from "../../../lib/layout-preview";
import {
  communityFoldTransition,
  communitySelectionClears,
  readCommunityPostParam,
  resolveCommunitySelection,
} from "../../../lib/community-selection";
import { BrandHeader, CommunityFeed, LoadingState, StateCard, WorkoutSummaryCard } from "../../../ui/components";
import { CenteredCard, TwoPane, useLayoutMode, WideColumn } from "../../../ui/layout";
import { CheckInEmptyContent } from "../../../ui/check-in-empty-content";
import { CommunityDatePicker } from "../../../ui/community-date-picker";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { ScrollAnchor } from "../../../ui/scroll-anchor";
import { colors, elevation, fonts, radii, spacing, type } from "../../../ui/theme";
import { holdComposerFocus, releaseComposerFocus, WorkoutDetailView, type WorkoutDetailFixture } from "../../../ui/workout-detail";
import { WorkoutDetailModal } from "../../../ui/workout-detail-modal";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const communityFeedAnchorKey = "community-feed";

export default function CommunityTabScreen() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ post?: string | string[] }>();
  const postParam = readCommunityPostParam(params.post);
  const { mode } = useLayoutMode();
  const layoutPreview = __DEV__ && isLayoutPreview();
  const { openWorkoutChooser, selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(!layoutPreview);
  const [error, setError] = useState<string | null>(null);
  const [groupMenuView, setGroupMenuView] = useState<"actions" | "groups" | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [currentDay, setCurrentDay] = useState(() => startOfLocalDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
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
  const dataRef = useRef<CommunityData | null>(null);
  const lastSuccessfulLoad = useRef<FreshnessRecord | null>(null);
  const inFlightRequests = useRef(new Map<string, Promise<void>>());
  const latestRequestKey = useRef<string | null>(null);
  const loadedUserId = useRef<string | null>(null);
  const resetDateOnNextFocus = useRef(false);

  const activeRoute = segments.join("/");

  useEffect(() => {
    const [root, tab] = activeRoute.split("/");
    if (root === "(tabs)" && tab !== "community") resetDateOnNextFocus.current = true;
  }, [activeRoute]);

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

    const selectedDayKey = toLocalDateInputValue(selectedDate);
    const groupKey = `community:${auth.session.user.id}:${selectedGroupId ?? "auto"}:${selectedDayKey}`;
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
      });
      const range = getLocalDayRange(selectedDate);
      search.set("start", range.start.toISOString());
      search.set("end", range.end.toISOString());
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as CommunityData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Community could not be loaded.");
      if (latestRequestKey.current !== requestKey) return;
      dataRef.current = body;
      loadedUserId.current = auth.session.user.id;
      lastSuccessfulLoad.current = {
        key: `community:${auth.session.user.id}:${body.selectedGroupId ?? "none"}:${selectedDayKey}`,
        loadedAt: Date.now(),
        workoutRevision,
      };
      setData(body);
      setSelectedGroupId(body.selectedGroupId);
      } catch (loadError) {
        if (latestRequestKey.current === requestKey) {
          setError(loadError instanceof Error ? loadError.message : "Community could not be loaded.");
        }
      } finally {
        if (latestRequestKey.current === requestKey) setLoading(false);
      }
    })().finally(() => inFlightRequests.current.delete(requestKey));
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [selectedDate, selectedGroupId, setSelectedGroupId]);

  useEffect(() => {
    if (layoutPreview) return;
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = setTimeout(() => {
      const nextCurrentDay = startOfLocalDay(new Date());
      latestRequestKey.current = null;
      setData((current) => {
        if (!current) return current;
        const next = { ...current, communityWorkouts: [] };
        dataRef.current = next;
        return next;
      });
      setCurrentDay(nextCurrentDay);
      setSelectedDate((current) => isSameLocalDay(current, currentDay) ? nextCurrentDay : current);
      lastSuccessfulLoad.current = null;
    }, nextDay.getTime() - now.getTime() + 1_000);
    return () => clearTimeout(timeout);
  }, [currentDay, layoutPreview]);

  const previewBoard = useMemo(() => (layoutPreview ? layoutPreviewCommunity() : null), [layoutPreview]);
  const board = previewBoard ?? data;
  const workouts = useMemo(() => board?.communityWorkouts ?? [], [board]);
  const selectedGroup = useMemo(
    () => board?.groups.find((group) => group.id === (selectedGroupId ?? board.selectedGroupId)) ?? null,
    [board, selectedGroupId],
  );
  const baseSelection = resolveCommunitySelection({
    postParam: explicitOverride ?? postParam,
    workouts,
  });
  let selection = baseSelection;
  let detail = detailTarget;
  if (modeRef.current !== mode) {
    const previousMode = modeRef.current;
    modeRef.current = mode;
    holdComposerFocus();
    const effect = communityFoldTransition({
      modalSessionId: detailTarget?.workout.id ?? null,
      nextMode: mode,
      previousMode,
      selection: baseSelection,
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

  const clearPostSelection = useCallback(() => {
    setExplicitOverride(null);
    setDetailTarget(null);
    if (postParam) router.setParams({ post: "" });
  }, [postParam, router]);

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
    if (!resetDateOnNextFocus.current) {
      void loadCommunity();
      return;
    }

    resetDateOnNextFocus.current = false;
    const today = startOfLocalDay(new Date());
    const dateChanged = !isSameLocalDay(selectedDate, today);

    setCurrentDay(today);
    lastSuccessfulLoad.current = null;
    clearFeed();

    if (dateChanged) {
      clearPostSelection();
      setSelectedDate(today);
      return;
    }

    void loadCommunity();
  }, [clearFeed, clearPostSelection, layoutPreview, loadCommunity, selectedDate]));

  const selectDate = useCallback((nextDate: Date) => {
    const normalized = startOfLocalDay(nextDate);
    if (normalized > currentDay || isSameLocalDay(normalized, selectedDate)) return;
    if (communitySelectionClears({
      nextDayKey: toLocalDateInputValue(normalized),
      nextGroupId: selectedGroupId,
      previousDayKey: toLocalDateInputValue(selectedDate),
      previousGroupId: selectedGroupId,
    })) clearPostSelection();
    clearFeed();
    setSelectedDate(normalized);
  }, [clearFeed, clearPostSelection, currentDay, selectedDate, selectedGroupId]);

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height);
    setBoardHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
  }, []);

  const openWorkoutDetail = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    setGroupMenuView(null);
    if (mode === "twoPane") {
      setExplicitOverride(workout.id);
      router.setParams({ post: workout.id });
      return;
    }
    setDetailTarget({ groupId: selectedGroup.id, workout });
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

  const editWorkout = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    router.push(`/groups/${encodeURIComponent(selectedGroup.id)}/workouts/${encodeURIComponent(workout.id)}/edit`);
  }, [router, selectedGroup]);

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
                    currentDay={currentDay}
                    groupMenuView={groupMenuView}
                    groups={board?.groups ?? []}
                    onOpenDatePicker={() => setDatePickerOpen(true)}
                    onOpenGroup={(groupId) => router.push(`/groups/${groupId}`)}
                    onSelectDate={selectDate}
                    onSelectGroup={(groupId) => {
                      if (communitySelectionClears({
                        nextDayKey: toLocalDateInputValue(selectedDate),
                        nextGroupId: groupId,
                        previousDayKey: toLocalDateInputValue(selectedDate),
                        previousGroupId: selectedGroup.id,
                      })) clearPostSelection();
                      clearFeed(groupId);
                      setSelectedGroupId(groupId);
                    }}
                    onToggleMenu={setGroupMenuView}
                    selectedDate={selectedDate}
                    selectedGroup={selectedGroup}
                  />
                </ScrollAnchor>
                <Text style={styles.boardTitle}>Community Board</Text>
                {workouts.length ? workouts.map((workout) => {
                  const selected = workout.id === openSessionId;
                  return (
                    <ScrollAnchor id={workout.id} key={workout.id}>
                      <Pressable
                        accessibilityLabel={`Open ${workout.title} workout details`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => openWorkoutDetail(workout)}
                        style={styles.paneCardPress}
                      >
                        <WorkoutSummaryCard
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
            right={openSessionId === null ? (
              <View style={[styles.paneEmpty, { paddingBottom: insets.bottom }]}>
                {isSameLocalDay(selectedDate, currentDay) ? (
                  <CheckInEmptyContent onCheckIn={openWorkoutChooser} />
                ) : (
                  <Text style={styles.historicalEmptyText}>No workouts were logged this day</Text>
                )}
              </View>
            ) : (
              <WorkoutDetailView
                key={openSessionId}
                fixture={previewFixture}
                groupId={selectedGroup.id}
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
                onReactionSummaryChange={updateFeedReactionSummary}
              />
            )}
          />
        </SafeAreaView>
        <CommunityDatePicker
          maximumDate={currentDay}
          onChange={selectDate}
          onDismiss={() => setDatePickerOpen(false)}
          value={selectedDate}
          visible={datePickerOpen}
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
                  <Feather color={colors.brand} name={groupMenuView ? "chevron-up" : "chevron-down"} size={18} style={styles.chevron} />
                </Pressable>
                {groupMenuView ? (
                  <View style={styles.groupDrawer}>
                    {groupMenuView === "actions" ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setGroupMenuView("groups")}
                          style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
                        >
                          <Feather color={colors.inkSoft} name="repeat" size={17} />
                          <Text style={styles.menuActionText}>Switch group</Text>
                          <Feather color={colors.muted} name="chevron-right" size={16} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setGroupMenuView(null);
                            router.push(`/groups/${selectedGroup.id}`);
                          }}
                          style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
                        >
                          <Feather color={colors.inkSoft} name="users" size={17} />
                          <Text style={styles.menuActionText}>View group</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          accessibilityLabel="Back to group menu"
                          accessibilityRole="button"
                          onPress={() => setGroupMenuView("actions")}
                          style={({ pressed }) => [styles.menuHeading, pressed && styles.pressed]}
                        >
                          <Feather color={colors.muted} name="chevron-left" size={16} />
                          <Text style={styles.menuHeadingText}>Switch group</Text>
                        </Pressable>
                        {board?.groups.map((group) => (
                          <Pressable
                            accessibilityRole="button"
                            key={group.id}
                            onPress={() => {
                              if (communitySelectionClears({
                                nextDayKey: toLocalDateInputValue(selectedDate),
                                nextGroupId: group.id,
                                previousDayKey: toLocalDateInputValue(selectedDate),
                                previousGroupId: selectedGroup.id,
                              })) clearPostSelection();
                              clearFeed(group.id);
                              setSelectedGroupId(group.id);
                              setGroupMenuView(null);
                            }}
                            style={({ pressed }) => [styles.groupOption, group.id === selectedGroup.id && styles.selectedOption, pressed && styles.pressed]}
                          >
                            <Text numberOfLines={1} style={styles.optionName}>{group.name}</Text>
                            {group.id === selectedGroup.id ? <Feather color={colors.brand} name="check" size={17} /> : null}
                          </Pressable>
                        ))}
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.dateNavigator}>
              <Pressable
                accessibilityLabel="Previous day"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => selectDate(addLocalDays(selectedDate, -1))}
                style={({ pressed }) => [styles.dateArrow, pressed && styles.pressed]}
              >
                <Feather color={colors.inkSoft} name="chevron-left" size={21} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Choose date, currently ${formatCommunityDayLabel(selectedDate, currentDay)}`}
                accessibilityRole="button"
                onPress={() => setDatePickerOpen(true)}
                style={({ pressed }) => [styles.dateLabelButton, pressed && styles.pressed]}
              >
                <Text style={styles.dateLabel}>{formatCommunityDayLabel(selectedDate, currentDay)}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Next day"
                accessibilityRole="button"
                accessibilityState={{ disabled: isSameLocalDay(selectedDate, currentDay) }}
                disabled={isSameLocalDay(selectedDate, currentDay)}
                hitSlop={8}
                onPress={() => selectDate(addLocalDays(selectedDate, 1))}
                style={({ pressed }) => [styles.dateArrow, isSameLocalDay(selectedDate, currentDay) && styles.dateArrowDisabled, pressed && styles.pressed]}
              >
                <Feather color={colors.inkSoft} name="chevron-right" size={21} />
              </Pressable>
            </View>

            <Text style={styles.boardTitle}>Community Board</Text>

            <View onLayout={handleBoardLayout} style={styles.boardArea}>
              {loading ? (
                <View style={styles.feedState}><ActivityIndicator color={colors.brand} /><Text style={styles.feedStateText}>Loading activity…</Text></View>
              ) : error ? (
                <View style={styles.feedState}><StateCard actionLabel="Try again" message={error} onAction={() => void loadCommunity()} title="Activity unavailable" /></View>
              ) : (board?.communityWorkouts.length ?? 0) > 0 ? (
                boardHeight > 0 ? <CommunityFeed anchorKey={communityFeedAnchorKey} edgeToEdge focusOffsetY={Math.min(boardHeight * 0.05, spacing.xxl)} mode="full" onWorkoutDelete={(workout) => { setDeleteError(null); setDeleteStage("choose"); setDeleteTarget(workout); }} onWorkoutEdit={editWorkout} onWorkoutPress={openWorkoutDetail} showCommentCount showReactionSummary viewerUserId={loadedUserId.current} viewportHeight={boardHeight} workouts={board?.communityWorkouts ?? []} /> : null
              ) : isSameLocalDay(selectedDate, currentDay) ? (
                <View style={styles.todayEmpty}>
                  <CheckInEmptyContent onCheckIn={openWorkoutChooser} />
                </View>
              ) : (
                <View style={styles.historicalEmpty}><Text style={styles.historicalEmptyText}>No workouts were logged this day</Text></View>
              )}
            </View>
          </>
        ) : (
          <StateCard actionLabel="Join a group" message="Join or create a group to start training with your community." onAction={() => router.push("/groups/join")} title="Find your crew" />
        )}
      </View>
      </WideColumn>
      <CommunityDatePicker
        maximumDate={currentDay}
        onChange={selectDate}
        onDismiss={() => setDatePickerOpen(false)}
        value={selectedDate}
        visible={datePickerOpen}
      />
      <WorkoutDetailModal
        key={detailTarget?.workout.id ?? "closed"}
        fixture={layoutPreview && detailTarget ? layoutPreviewDetail(detailTarget.workout.id) : null}
        groupId={detailTarget?.groupId ?? null}
        initialWorkout={detailTarget?.workout ?? null}
        onCommentCountChange={updateFeedCommentCount}
        onDismiss={() => {
          setDetailTarget(null);
          setExplicitOverride(null);
          if (postParam) router.setParams({ post: "" });
        }}
        onReactionSummaryChange={updateFeedReactionSummary}
        sessionId={detailTarget?.workout.id ?? null}
        visible={detailTarget !== null}
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
    </SafeAreaView>
    </View>
  );
}

function CommunityGroupControls({
  currentDay,
  groupMenuView,
  groups,
  onOpenDatePicker,
  onOpenGroup,
  onSelectDate,
  onSelectGroup,
  onToggleMenu,
  selectedDate,
  selectedGroup,
}: {
  currentDay: Date;
  groupMenuView: "actions" | "groups" | null;
  groups: GroupSummary[];
  onOpenDatePicker: () => void;
  onOpenGroup: (groupId: string) => void;
  onSelectDate: (date: Date) => void;
  onSelectGroup: (groupId: string) => void;
  onToggleMenu: (view: "actions" | "groups" | null) => void;
  selectedDate: Date;
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
            <Feather color={colors.brand} name={groupMenuView ? "chevron-up" : "chevron-down"} size={18} style={styles.chevron} />
          </Pressable>
          {groupMenuView ? (
            <View style={styles.groupDrawer}>
              {groupMenuView === "actions" ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => onToggleMenu("groups")} style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}>
                    <Feather color={colors.inkSoft} name="repeat" size={17} />
                    <Text style={styles.menuActionText}>Switch group</Text>
                    <Feather color={colors.muted} name="chevron-right" size={16} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onToggleMenu(null);
                      onOpenGroup(selectedGroup.id);
                    }}
                    style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
                  >
                    <Feather color={colors.inkSoft} name="users" size={17} />
                    <Text style={styles.menuActionText}>View group</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable accessibilityLabel="Back to group menu" accessibilityRole="button" onPress={() => onToggleMenu("actions")} style={({ pressed }) => [styles.menuHeading, pressed && styles.pressed]}>
                    <Feather color={colors.muted} name="chevron-left" size={16} />
                    <Text style={styles.menuHeadingText}>Switch group</Text>
                  </Pressable>
                  {groups.map((group) => (
                    <Pressable
                      accessibilityRole="button"
                      key={group.id}
                      onPress={() => {
                        onSelectGroup(group.id);
                        onToggleMenu(null);
                      }}
                      style={({ pressed }) => [styles.groupOption, group.id === selectedGroup.id && styles.selectedOption, pressed && styles.pressed]}
                    >
                      <Text numberOfLines={1} style={styles.optionName}>{group.name}</Text>
                      {group.id === selectedGroup.id ? <Feather color={colors.brand} name="check" size={17} /> : null}
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.dateNavigator}>
        <Pressable accessibilityLabel="Previous day" accessibilityRole="button" hitSlop={8} onPress={() => onSelectDate(addLocalDays(selectedDate, -1))} style={({ pressed }) => [styles.dateArrow, pressed && styles.pressed]}>
          <Feather color={colors.inkSoft} name="chevron-left" size={21} />
        </Pressable>
        <Pressable accessibilityLabel={`Choose date, currently ${formatCommunityDayLabel(selectedDate, currentDay)}`} accessibilityRole="button" onPress={onOpenDatePicker} style={({ pressed }) => [styles.dateLabelButton, pressed && styles.pressed]}>
          <Text style={styles.dateLabel}>{formatCommunityDayLabel(selectedDate, currentDay)}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          accessibilityState={{ disabled: isSameLocalDay(selectedDate, currentDay) }}
          disabled={isSameLocalDay(selectedDate, currentDay)}
          hitSlop={8}
          onPress={() => onSelectDate(addLocalDays(selectedDate, 1))}
          style={({ pressed }) => [styles.dateArrow, isSameLocalDay(selectedDate, currentDay) && styles.dateArrowDisabled, pressed && styles.pressed]}
        >
          <Feather color={colors.inkSoft} name="chevron-right" size={21} />
        </Pressable>
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
    <Modal animationType="fade" onRequestClose={onDismiss} transparent visible={visible}>
      <View style={styles.deleteOverlay}>
        <Pressable accessibilityLabel="Cancel deletion" disabled={pending} onPress={onDismiss} style={[StyleSheet.absoluteFill, styles.deleteBackdrop]} />
        <CenteredCard>
        <View accessibilityViewIsModal style={styles.deletePanel}>
          <Text style={styles.deleteTitle}>{stage === "choose" ? "Delete workout?" : "Permanently delete workout?"}</Text>
          <Text style={styles.deleteMessage}>{stage === "choose" ? "Choose what you want to remove." : "This removes the workout from your history and every Community post. This cannot be undone."}</Text>
          {stage === "choose" ? (
            <>
              <Pressable accessibilityRole="button" disabled={pending} onPress={onDeletePost} style={styles.deleteChoice}>
                <Text style={styles.deleteChoiceTitle}>Delete post only</Text>
                <Text style={styles.deleteChoiceCopy}>Remove this rep-in from the group. Your workout will stay in your history.</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={pending} onPress={onDeleteWorkout} style={styles.deleteChoice}>
                <Text style={styles.destructiveTitle}>Delete post and workout</Text>
                <Text style={styles.deleteChoiceCopy}>Permanently delete this workout and its Community post.</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" disabled={pending} onPress={onDeleteWorkout} style={styles.confirmDelete}>
              {pending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.confirmDeleteText}>Permanently delete</Text>}
            </Pressable>
          )}
          {error ? <Text style={styles.deleteError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={pending} onPress={onDismiss} style={styles.cancelDelete}><Text style={styles.cancelDeleteText}>Cancel</Text></Pressable>
        </View>
        </CenteredCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1, overflow: "hidden" },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  pickerBackdrop: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
  groupHeaderRow: { alignItems: "center", flexDirection: "row", marginTop: spacing.xs, minHeight: 48, zIndex: 20 },
  selectorAnchor: { flexShrink: 1, maxWidth: "100%", position: "relative", zIndex: 21 },
  selector: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: 44, paddingRight: spacing.sm },
  groupName: { color: colors.ink, flexShrink: 1, ...type.screenTitle },
  chevron: { marginLeft: spacing.xs },
  groupDrawer: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, boxShadow: elevation.e2, left: 0, maxWidth: 280, minWidth: 220, padding: spacing.xs, position: "absolute", top: "100%", zIndex: 21 },
  menuAction: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  menuActionText: { color: colors.ink, flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  menuHeading: { alignItems: "center", flexDirection: "row", gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.sm },
  menuHeadingText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  groupOption: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", minHeight: 44, paddingHorizontal: spacing.md },
  selectedOption: { backgroundColor: colors.surfaceMuted },
  optionName: { color: colors.inkSoft, flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  dateNavigator: { alignItems: "center", alignSelf: "center", flexDirection: "row", justifyContent: "center", marginTop: spacing.xs },
  dateArrow: { alignItems: "center", justifyContent: "center", minHeight: 44, width: 52 },
  dateArrowDisabled: { opacity: 0.28 },
  dateLabelButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 128, paddingHorizontal: spacing.md },
  dateLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  boardTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, marginBottom: spacing.sm, marginTop: spacing.sm },
  boardArea: { backgroundColor: colors.surfaceMuted, borderTopColor: colors.border, borderTopWidth: 1, flex: 1, marginHorizontal: -spacing.xxl, minHeight: 0 },
  feedState: { flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xxl },
  feedStateText: { color: colors.muted, ...type.bodySmall, textAlign: "center" },
  todayEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  historicalEmpty: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  historicalEmptyText: { color: colors.muted, ...type.body, textAlign: "center" },
  deleteOverlay: { flex: 1 },
  deleteBackdrop: { backgroundColor: colors.overlay },
  deletePanel: { backgroundColor: colors.surface, borderRadius: radii.lg, boxShadow: elevation.e3, padding: spacing.xxl, width: "100%" },
  deleteTitle: { color: colors.ink, ...type.title },
  deleteMessage: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  deleteChoice: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 72, paddingVertical: spacing.md },
  deleteChoiceTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  destructiveTitle: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 16 },
  deleteChoiceCopy: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  confirmDelete: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radii.md, justifyContent: "center", marginTop: spacing.xl, minHeight: 48 },
  confirmDeleteText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 16 },
  deleteError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.md },
  cancelDelete: { alignItems: "center", justifyContent: "center", marginTop: spacing.md, minHeight: 44 },
  cancelDeleteText: { color: colors.inkSoft, ...type.label },
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
  return {
    communityWorkouts: [
      workout("w1", "Maya L.", "user-maya", "Easy shakeout", "run", 7, 12, 4, "Legs felt great today", "5 km Run"),
      workout("w2", "Jordan P.", "user-jordan", "Push day", "strength_training", 6, 40, 4, null, "45 min Strength Training"),
      workout("w3", "Sam R.", "user-sam", "Hill repeats", "run", 6, 5, 4, null, "8 km Run"),
    ],
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
