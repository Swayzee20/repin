import {
  personFirstName,
  resolveUserDisplayName,
  type GoalBadge,
  type HomeCrewHighlights,
  type HomeData,
  type HomeGoalSnapshot,
  type PrBadge,
  type WorkoutFeedItem,
} from "@repin/types";
import {
  goalCopy,
  highlightRows,
  homeComingUp,
  homeGoalRowModel,
  selectHomeGoals,
} from "@repin/validation";
import type { Session } from "@supabase/supabase-js";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVerticalBarEdge } from "../../../ui/vertical-bar-edge";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { normalizeInviteRedirect } from "../../../lib/invite-route";
import { isLayoutPreview } from "../../../lib/layout-preview";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { workoutMenuItems } from "../../../lib/content-menu";
import { useGoalBadgeUndo } from "../../../lib/goal-badge-actions";
import { usePrBadgeUndo } from "../../../lib/pr-badge-actions";
import { LoadingState } from "../../../ui/components";
import { prCopy } from "../../../ui/pr-copy";
import { PrUndoToast } from "../../../ui/pr-undo-toast";
import { useModeration } from "../../../ui/moderation";
import {
  HomeActivity,
  HomeComingUpCard,
  HomeCrewEyebrow,
  HomeErrorCards,
  HomeGreeting,
  HomeHighlights,
  HomeLoadingSkeleton,
  HomeSnapshotCard,
  HomeThisWeekCard,
  HomeViewGoals,
  StaleBanner,
} from "../../../ui/home";
import {
  homeComingUpInCard,
  homeGoalLimit,
  homeHighlightLimit,
  homeIsShortScreen,
  homePromptLimit,
} from "../../../ui/home-layout";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { ScrollAnchor } from "../../../ui/scroll-anchor";
import { WorkoutDetailModal } from "../../../ui/workout-detail-modal";
import { colors, spacing } from "../../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function HomeScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { mode } = useLayoutMode();
  const insets = useSafeAreaInsets();
  const verticalBarEdge = useVerticalBarEdge();
  const { setSelectedGroupId: setTabGroupId } = useMainTabs();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const layoutPreview = __DEV__ && isLayoutPreview();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const [localDayKey, setLocalDayKey] = useState(() => localDateKey(new Date()));
  const [detailWorkout, setDetailWorkout] = useState<WorkoutFeedItem | null>(null);
  const homeDataRef = useRef<HomeData | null>(null);
  const lastSuccessfulLoad = useRef<FreshnessRecord | null>(null);
  const inFlightRequests = useRef(new Map<string, Promise<void>>());
  const latestRequestKey = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
      if (data.session && inviteRedirect) router.replace(inviteRedirect);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setAuthLoading(false); setHomeData(null); setSelectedGroupId(null);
      homeDataRef.current = null;
      lastSuccessfulLoad.current = null;
      setStaleAt(null);
      if (nextSession && inviteRedirect) router.replace(inviteRedirect);
    });
    return () => subscription.subscription.unsubscribe();
  }, [inviteRedirect, router]);

  const loadHome = useCallback(async () => {
    if (!session || inviteRedirect) return;
    const groupKey = `home:${session.user.id}:${selectedGroupId ?? "auto"}`;
    const workoutRevision = getWorkoutDataRevision();
    if (
      homeDataRef.current &&
      isFresh(lastSuccessfulLoad.current, groupKey, workoutRevision)
    ) return;

    const requestKey = `${groupKey}:${workoutRevision}`;
    const currentRequest = inFlightRequests.current.get(requestKey);
    if (currentRequest) return currentRequest;

    latestRequestKey.current = requestKey;
    const request = (async () => {
      setHomeLoading(true); setHomeError(null);
      try {
      const search = new URLSearchParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
        view: "home",
      });
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as HomeData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Home could not be loaded.");
      if (body.groups.length === 0) {
        router.replace("/onboarding/groups");
        return;
      }
      if (latestRequestKey.current !== requestKey) return;
      const resolvedGroupKey = `home:${session.user.id}:${body.selectedGroupId ?? "none"}`;
      homeDataRef.current = body;
      lastSuccessfulLoad.current = {
        key: resolvedGroupKey,
        loadedAt: Date.now(),
        workoutRevision,
      };
      setHomeData(body); setSelectedGroupId(body.selectedGroupId); setTabGroupId(body.selectedGroupId);
      setStaleAt(null);
      } catch (error) {
        if (latestRequestKey.current === requestKey) {
          setHomeError(error instanceof Error ? error.message : "Home could not be loaded.");
          if (homeDataRef.current) {
            setStaleAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
          }
        }
      } finally {
        if (latestRequestKey.current === requestKey) setHomeLoading(false);
      }
    })().finally(() => {
      if (inFlightRequests.current.get(requestKey) === request) {
        inFlightRequests.current.delete(requestKey);
      }
    });
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [inviteRedirect, router, selectedGroupId, session, setTabGroupId]);

  useFocusEffect(useCallback(() => { if (session) void loadHome(); }, [loadHome, session]));

  useEffect(() => {
    const now = new Date();
    const nextLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = setTimeout(() => {
      lastSuccessfulLoad.current = null;
      setLocalDayKey(localDateKey(new Date()));
      void loadHome();
    }, nextLocalDay.getTime() - now.getTime() + 1_000);
    return () => clearTimeout(timeout);
  }, [loadHome, localDayKey]);

  const dashboardData = __DEV__ && layoutPreview ? layoutPreviewHome() : homeData;
  const selectedGroup = useMemo(
    () => dashboardData?.groups.find((group) => group.id === dashboardData.selectedGroupId),
    [dashboardData],
  );
  const hideHomeWorkouts = useCallback((matches: (workout: WorkoutFeedItem) => boolean) => {
    setHomeData((current) => {
      if (!current) return current;
      const nextWorkouts = current.communityWorkouts.filter((workout) => !matches(workout));
      const hiddenIds = new Set(
        current.communityWorkouts.filter(matches).map((workout) => workout.userId),
      );
      const nextHighlights = filterHighlights(current.crewHighlights, (person) => !hiddenIds.has(person.userId));
      const next = {
        ...current,
        communityWorkouts: nextWorkouts,
        crewHighlights: nextHighlights,
      };
      homeDataRef.current = next;
      return next;
    });
  }, []);
  const applyHomePrBadges = useCallback((sessionId: string, prBadges: PrBadge[]) => {
    setHomeData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, prBadges } : workout,
        ),
      };
      homeDataRef.current = next;
      return next;
    });
  }, []);
  const prUndo = usePrBadgeUndo(applyHomePrBadges);
  const applyHomeGoalBadges = useCallback((sessionId: string, goalBadges: GoalBadge[]) => {
    setHomeData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        communityWorkouts: current.communityWorkouts.map((workout) =>
          workout.id === sessionId ? { ...workout, goalBadges } : workout,
        ),
      };
      homeDataRef.current = next;
      return next;
    });
  }, []);
  const goalUndo = useGoalBadgeUndo(applyHomeGoalBadges);
  const moderation = useModeration({
    onPostHidden: (sessionId) => hideHomeWorkouts((workout) => workout.id === sessionId),
    onUserBlocked: (userId) => hideHomeWorkouts((workout) => workout.userId === userId),
  });
  const dashboardBottomPadding = verticalBarEdge !== null ? insets.bottom + spacing.xxl : 160;
  const twoPane = mode === "twoPane";
  const shortScreen = homeIsShortScreen(mode, windowHeight);
  const now = new Date();
  const greetingName = greetingFirstName(
    dashboardData?.user.displayName
      ?? (typeof session?.user.user_metadata?.display_name === "string" ? session.user.user_metadata.display_name : ""),
  );

  if (!layoutPreview && authLoading && !session) return <Shell><LoadingState message="Checking your account…" /></Shell>;
  if (!layoutPreview && !session) return null;

  const firstLoad = !dashboardData;
  const showSkeletons = firstLoad && homeLoading;
  const showError = firstLoad && Boolean(homeError);
  const errors = HomeErrorCards({ onRetry: () => void loadHome(), showCrewAction: false });
  const skeletons = HomeLoadingSkeleton({ twoPane });
  const goals = dashboardData?.goals ?? [];
  const visibleGoals = selectHomeGoals(goals, now, homeGoalLimit(mode, shortScreen)).map((goal) =>
    homeGoalRowModel(goal, now),
  );
  const comingUp = homeComingUp({
    goals,
    displayed: visibleGoals,
    now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const highlightLimit = homeHighlightLimit(shortScreen);
  const highlightItems = highlightRows({
    firstToRepInToday: dashboardData?.crewHighlights?.firstToRepInToday ?? null,
    weekly: dashboardData?.crewHighlights?.weekly ?? [],
    limit: highlightLimit,
  });
  const prompts = (dashboardData?.communityWorkouts ?? []).slice(0, homePromptLimit(mode, shortScreen));
  const comingUpCard = homeComingUpInCard(mode);

  return (
    <View style={[styles.safeArea, styles.homeSafeArea]}>
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <TwoPane
          column="readable"
          contentPaddingBottom={dashboardBottomPadding}
          fallback="stack"
          left={(
            <View style={styles.personalZone}>
              <ScrollAnchor id="home-greeting">
                <View style={styles.header}>
                  <HomeGreeting name={greetingName} />
                </View>
              </ScrollAnchor>
              {staleAt ? <StaleBanner onRetry={() => void loadHome()} time={staleAt} /> : null}
              {showError ? errors.personal : showSkeletons ? skeletons.snapshot : dashboardData ? (
                <>
                  <ScrollAnchor id="home-snapshot">
                    {twoPane ? (
                      <HomeThisWeekCard
                        goals={visibleGoals}
                        occurredAt={dashboardData.snapshot.workoutOccurredAtThisWeek}
                        onOpenGoal={(id) => router.push(`/goals/${id}`)}
                        onSetGoal={() => router.push("/goals/new")}
                        weekCount={dashboardData.snapshot.workoutsThisWeek}
                        weeks={dashboardData.streak?.weeks ?? 0}
                      />
                    ) : (
                      <HomeSnapshotCard
                        comingUp={comingUp}
                        goals={visibleGoals}
                        occurredAt={dashboardData.snapshot.workoutOccurredAtThisWeek}
                        onOpenGoal={(id) => router.push(`/goals/${id}`)}
                        onSetGoal={() => router.push("/goals/new")}
                        weekCount={dashboardData.snapshot.workoutsThisWeek}
                        weeks={dashboardData.streak?.weeks ?? 0}
                      />
                    )}
                  </ScrollAnchor>
                  {goals.length ? (
                    <HomeViewGoals onPress={() => router.navigate("/profile")} />
                  ) : null}
                  {comingUpCard ? (
                    <ScrollAnchor id="home-coming-up">
                      <View style={styles.comingUp}>
                        <HomeComingUpCard
                          comingUp={comingUp}
                          onOpenGoal={(id) => router.push(`/goals/${id}`)}
                        />
                      </View>
                    </ScrollAnchor>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
          right={(
            <View style={styles.communityZone}>
              <ScrollAnchor id="home-crew">
                <HomeCrewEyebrow name={selectedGroup?.name ?? null} />
              </ScrollAnchor>
              {showError ? errors.crew : showSkeletons ? (
                <>
                  {skeletons.highlights}
                  {skeletons.activity}
                </>
              ) : dashboardData ? (
                <>
                  <HomeHighlights rows={highlightItems} />
                  <HomeActivity
                    menuFor={(workout) => workoutMenuItems({
                      onBlock: (item) => moderation.askBlock(item.userId, item.displayName, {
                        displayName: item.displayName,
                        hideId: item.id,
                        kind: "post",
                        targetId: item.communityPostId ?? item.id,
                        userId: item.userId,
                      }),
                      onRemoveGoalBadge: (item) => void goalUndo.remove(item),
                      onRemovePrBadge: (item) => void prUndo.remove(item),
                      onReport: (item) => moderation.askReportPost(item),
                      viewerUserId: session?.user.id ?? dashboardData.user.id,
                      workout,
                    })}
                    now={now}
                    onOpen={setDetailWorkout}
                    onViewAll={selectedGroup ? () => {
                      setTabGroupId(selectedGroup.id);
                      router.navigate("/community");
                    } : undefined}
                    workouts={prompts}
                  />
                </>
              ) : null}
            </View>
          )}
        />
      </SafeAreaView>
      {moderation.ui}
      <WorkoutDetailModal
        key={detailWorkout?.id ?? "closed"}
        groupId={selectedGroup?.id ?? detailWorkout?.groupId ?? null}
        groupName={selectedGroup?.name ?? null}
        initialWorkout={detailWorkout}
        onDismiss={() => setDetailWorkout(null)}
        onGoalBadgesChange={applyHomeGoalBadges}
        onPostHidden={(sessionId) => hideHomeWorkouts((workout) => workout.id === sessionId)}
        onPrBadgesChange={applyHomePrBadges}
        onUserBlocked={(userId) => hideHomeWorkouts((workout) => workout.userId === userId)}
        sessionId={detailWorkout?.id ?? null}
        viewerUserId={session?.user.id ?? dashboardData?.user.id ?? null}
        visible={detailWorkout !== null}
      />
      <PrUndoToast
        message={goalUndo.visible ? goalCopy.toast : prCopy.toast}
        onClear={goalUndo.visible ? goalUndo.clear : prUndo.clear}
        onUndo={() => void (goalUndo.visible ? goalUndo.undo() : prUndo.undo())}
        undoLabel={goalUndo.visible ? goalCopy.toastUndo : prCopy.toastUndo}
        visible={prUndo.visible || goalUndo.visible}
      />
    </View>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.flex}>
        <SafeAreaView edges={["left", "right"]} style={styles.flex}>{children}</SafeAreaView>
      </SafeAreaView>
    </View>
  );
}

function greetingFirstName(displayName: string) {
  if (!displayName.trim()) return "";
  return personFirstName(resolveUserDisplayName({ displayName }));
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function filterHighlights(
  highlights: HomeCrewHighlights | undefined,
  keep: (person: { userId: string }) => boolean,
): HomeCrewHighlights | undefined {
  if (!highlights) return highlights;
  return {
    firstToRepInToday: highlights.firstToRepInToday && keep(highlights.firstToRepInToday)
      ? highlights.firstToRepInToday
      : null,
    weekly: highlights.weekly.filter(keep),
  };
}

function layoutPreviewHome(): HomeData {
  if (!__DEV__) {
    throw new Error("Home layout preview is development-only.");
  }
  const occurredAt = "2026-11-18T19:41:00.000Z";
  const workout = (
    id: string,
    displayName: string,
    userId: string,
    title: string,
    workoutType: string,
    at: string,
    resultSummary: string,
  ): WorkoutFeedItem => ({
    caption: null,
    completedAt: at,
    createdAt: at,
    displayName,
    durationMinutes: 32,
    effort: 3,
    groupId: "group-1",
    id,
    name: title,
    notes: null,
    occurredAt: at,
    photoPath: null,
    resultSummary,
    title,
    updatedAt: at,
    userId,
    workoutType,
  });
  const communityWorkouts = [
    workout("w1", "Maya L.", "user-maya", "Easy shakeout", "run", occurredAt, "4.0 mi"),
    workout("w2", "Sam R.", "user-sam", "Lift", "strength_training", "2026-11-18T16:41:00.000Z", "45 min"),
    workout("w3", "Alex P.", "user-alex", "Easy 3", "run", "2026-11-17T21:41:00.000Z", "an easy 3 mi"),
    workout("w4", "Jordan P.", "user-jordan", "Ride", "cycling", "2026-11-17T21:41:00.000Z", "a 40 min"),
    workout("w5", "Riley K.", "user-riley", "Run", "run", "2026-11-16T21:41:00.000Z", "5.2 mi"),
  ];
  const runs: HomeGoalSnapshot = {
    id: "goal-runs",
    title: "4 runs this week",
    kind: "volume",
    metric: "workout_count",
    schedule: "weekly",
    displayUnit: "count",
    targetValue: 4,
    timeZone: "America/Chicago",
    deadlineAt: null,
    progress: {
      current: 1,
      target: 4,
      ratio: 0.25,
      label: "1 of 4",
      periodLabel: null,
      lastQualifyingLabel: null,
    },
    currentDisplay: 1,
    targetDisplay: 4,
  };
  const miles: HomeGoalSnapshot = {
    id: "goal-miles",
    title: "20 miles this week",
    kind: "volume",
    metric: "distance",
    schedule: "weekly",
    displayUnit: "mi",
    targetValue: 20 * 1_609.344,
    timeZone: "America/Chicago",
    deadlineAt: null,
    progress: {
      current: 8 * 1_609.344,
      target: 20 * 1_609.344,
      ratio: 0.4,
      label: "8 of 20 mi",
      periodLabel: null,
      lastQualifyingLabel: null,
    },
    currentDisplay: 8,
    targetDisplay: 20,
  };
  const race: HomeGoalSnapshot = {
    id: "goal-race",
    title: "5K race",
    kind: "time",
    metric: "time",
    schedule: "one_time",
    displayUnit: null,
    targetValue: 1500,
    timeZone: "America/Chicago",
    deadlineAt: "2026-11-21T06:00:00.000Z",
    progress: {
      current: 0,
      target: 1500,
      ratio: 0,
      label: "0%",
      periodLabel: null,
      lastQualifyingLabel: null,
    },
    currentDisplay: 0,
    targetDisplay: 1500,
  };
  return {
    communityWorkouts,
    crewHighlights: {
      firstToRepInToday: { displayName: "Maya L.", userId: "user-maya" },
      weekly: [{ count: 3, displayName: "Maya L.", userId: "user-maya" }],
    },
    goals: [runs, miles, race],
    groups: [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "group-1",
      name: "Strong Boys",
      ownerId: "user-josue",
      role: "owner",
    }],
    selectedGroupId: "group-1",
    snapshot: {
      hasWorkoutToday: true,
      message: "Three sessions already this week.",
      mostRecentWorkoutToday: communityWorkouts[0] ?? null,
      workoutOccurredAtThisWeek: [
        "2026-11-15T12:00:00.000Z",
        "2026-11-16T12:00:00.000Z",
        "2026-11-17T12:00:00.000Z",
      ],
      workoutsThisWeek: 3,
    },
    streak: { weeks: 4 },
    user: {
      createdAt: "2026-01-01T00:00:00.000Z",
      displayName: "Josue",
      id: "user-josue",
    },
  };
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  homeSafeArea: { backgroundColor: colors.background, ...Platform.select({ web: { paddingBottom: 0 } }) },
  personalZone: { backgroundColor: colors.background, paddingBottom: spacing.md, paddingTop: spacing.lg },
  header: { marginBottom: spacing.lg },
  comingUp: { marginTop: spacing.md },
  communityZone: { backgroundColor: colors.background, paddingTop: spacing.sm },
});
