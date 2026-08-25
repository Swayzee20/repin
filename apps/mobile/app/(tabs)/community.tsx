import type { CommunityData, CommunityReactionSummary, WorkoutFeedItem } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../lib/data-freshness";
import { BrandHeader, CommunityFeed, LoadingState, StateCard } from "../../ui/components";
import { useMainTabs } from "../../ui/main-tabs-context";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";
import { WorkoutDetailModal } from "../../ui/workout-detail-modal";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function CommunityTabScreen() {
  const router = useRouter();
  const { selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [boardHeight, setBoardHeight] = useState(0);
  const [detailTarget, setDetailTarget] = useState<{
    groupId: string;
    workout: WorkoutFeedItem;
  } | null>(null);
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

    const groupKey = `community:${auth.session.user.id}:${selectedGroupId ?? "auto"}`;
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
        key: `community:${auth.session.user.id}:${body.selectedGroupId ?? "none"}`,
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
  }, [selectedGroupId, setSelectedGroupId]);

  useFocusEffect(useCallback(() => { void loadCommunity(); }, [loadCommunity]));

  const selectedGroup = useMemo(
    () => data?.groups.find((group) => group.id === data.selectedGroupId) ?? null,
    [data],
  );

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height);
    setBoardHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
  }, []);

  const openWorkoutDetail = useCallback((workout: WorkoutFeedItem) => {
    if (!selectedGroup) return;
    setPickerOpen(false);
    setDetailTarget({ groupId: selectedGroup.id, workout });
  }, [selectedGroup]);

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

  if (loading && !data) return <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}><LoadingState message="Loading Community…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}><View style={styles.state}><StateCard actionLabel="Try again" message={error} onAction={() => void loadCommunity()} title="Community unavailable" /></View></SafeAreaView>;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <View style={styles.content}>
        <BrandHeader />
        <Text style={styles.title}>Community</Text>

        {selectedGroup ? (
          <>
            {pickerOpen ? (
              <Pressable
                accessibilityLabel="Close group selector"
                accessibilityRole="button"
                onPress={() => setPickerOpen(false)}
                style={styles.pickerBackdrop}
              />
            ) : null}
            <View style={styles.groupHeaderRow}>
              <View style={styles.selectorAnchor}>
                <Pressable
                  accessibilityLabel={`Selected group: ${selectedGroup.name}. Change group`}
                  accessibilityRole="button"
                  onPress={() => setPickerOpen((open) => !open)}
                  style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.groupName}>{selectedGroup.name}</Text>
                  <Text style={styles.chevron}>{pickerOpen ? "▴" : "▾"}</Text>
                </Pressable>
                {pickerOpen ? (
                  <View style={styles.groupDrawer}>
                    {data?.groups.map((group) => (
                      <Pressable
                        accessibilityRole="button"
                        key={group.id}
                        onPress={() => {
                          setSelectedGroupId(group.id);
                          setPickerOpen(false);
                        }}
                        style={({ pressed }) => [styles.groupOption, group.id === selectedGroup.id && styles.selectedOption, pressed && styles.pressed]}
                      >
                        <Text numberOfLines={1} style={styles.optionName}>{group.name}</Text>
                        {group.id === selectedGroup.id ? <Text style={styles.check}>✓</Text> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`/groups/${selectedGroup.id}`)}><Text style={styles.actionText}>View group ›</Text></Pressable>
            </View>

            <View onLayout={handleBoardLayout} style={styles.boardArea}>
              {data?.communityWorkouts.length ? (
                boardHeight > 0 ? <CommunityFeed edgeToEdge focusOffsetY={Math.min(boardHeight * 0.05, spacing.xxl)} mode="full" onWorkoutPress={openWorkoutDetail} showCommentCount showReactionSummary viewportHeight={boardHeight} workouts={data.communityWorkouts} /> : null
              ) : (
                <View style={styles.emptyBoardContent}><StateCard title="The board is quiet" message="Log a workout to get the conversation started." /></View>
              )}
              {loading || error ? (
                <View pointerEvents="none" style={styles.refreshStatus}>
                  {loading ? <ActivityIndicator color={colors.brand} size="small" /> : null}
                  {error ? <Text numberOfLines={1} style={styles.error}>Refresh failed</Text> : null}
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <StateCard actionLabel="Join a group" message="Join or create a group to start training with your community." onAction={() => router.push("/groups/join")} title="Find your crew" />
        )}
      </View>
      <WorkoutDetailModal
        groupId={detailTarget?.groupId ?? null}
        initialWorkout={detailTarget?.workout ?? null}
        onCommentCountChange={updateFeedCommentCount}
        onDismiss={() => setDetailTarget(null)}
        onReactionSummaryChange={updateFeedReactionSummary}
        sessionId={detailTarget?.workout.id ?? null}
        visible={detailTarget !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  pickerBackdrop: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
  groupHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm, minHeight: 44, zIndex: 20 },
  selectorAnchor: { flexShrink: 1, maxWidth: "75%", position: "relative", zIndex: 21 },
  selector: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  groupName: { color: colors.ink, flexShrink: 1, ...type.title },
  chevron: { color: colors.brand, fontFamily: fonts.bold, fontSize: 16, marginLeft: spacing.sm },
  groupDrawer: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, elevation: 4, left: 0, maxWidth: 280, minWidth: 220, padding: spacing.xs, position: "absolute", shadowColor: colors.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8, top: "100%", zIndex: 21 },
  groupOption: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", minHeight: 44, paddingHorizontal: spacing.md },
  selectedOption: { backgroundColor: colors.brandSoft },
  optionName: { color: colors.inkSoft, flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  check: { color: colors.brand, fontFamily: fonts.bold, fontSize: 17 },
  boardArea: { backgroundColor: "#F7F2F2", borderTopColor: colors.border, borderTopWidth: 1, flex: 1, marginHorizontal: -spacing.xxl, minHeight: 0 },
  refreshStatus: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.92)", borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 30, paddingHorizontal: spacing.sm, position: "absolute", right: spacing.md, top: spacing.sm, zIndex: 30 },
  emptyBoardContent: { padding: spacing.lg },
  actionText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12 },
  pressed: { opacity: 0.72 },
});
