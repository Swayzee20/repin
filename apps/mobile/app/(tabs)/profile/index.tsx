import { getUserInitials, MAX_ACTIVE_GOALS, resolveUserDisplayName, type GoalsListResponse, type ProfileData } from "@repin/types";
import type { CurrentBest, PersonalWorkoutListItem, WorkoutStatsResponse } from "@repin/types";
import { formatTotalsTime, profileDashboardCopy, type DashboardDistanceUnit } from "@repin/validation";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { listGoals } from "../../../lib/goals-api";
import { isLayoutPreview } from "../../../lib/layout-preview";
import {
  deviceTimeQuery,
  fetchOwnedPersonalRecords,
  fetchOwnedWorkoutStats,
  fetchOwnedWorkouts,
} from "../../../lib/profile-dashboard-api";
import { supabase } from "../../../lib/supabase";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { BrandHeader, Card, LoadingState, StateCard } from "../../../ui/components";
import { GoalsSection } from "../../../ui/goals";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { ListRow } from "../../../ui/primitives";
import {
  CrewsBlock,
  CurrentBestsPreview,
  IdentitySubtitle,
  RecentWorkoutsSection,
  StaleBanner,
  TotalsCard,
  coverageInput,
} from "../../../ui/profile-dashboard";
import { TotalsHelpSheet } from "../../../ui/totals-help-sheet";
import { colors, radii, size, spacing, type } from "../../../ui/theme";
import { useStripPresent } from "../../../ui/vertical-bar-edge";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function ProfileTabScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const stripPresent = useStripPresent();
  const insets = useSafeAreaInsets();
  const { selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalsListResponse | null>(null);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [stats, setStats] = useState<WorkoutStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recent, setRecent] = useState<PersonalWorkoutListItem[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [bests, setBests] = useState<CurrentBest[] | null>(null);
  const [bestsError, setBestsError] = useState<string | null>(null);
  const [bestsLoading, setBestsLoading] = useState(true);
  const [distanceUnit, setDistanceUnit] = useState<DashboardDistanceUnit>("mi");
  const [helpOpen, setHelpOpen] = useState(false);
  const dataRef = useRef<ProfileData | null>(null);
  const lastSuccessfulLoad = useRef<FreshnessRecord | null>(null);
  const inFlightRequests = useRef(new Map<string, Promise<void>>());
  const latestRequestKey = useRef<string | null>(null);
  const loadedUserId = useRef<string | null>(null);

  const clearOwnerState = useCallback(() => {
    dataRef.current = null;
    lastSuccessfulLoad.current = null;
    setData(null);
    setStats(null);
    setRecent(null);
    setBests(null);
    setGoals(null);
    setStaleAt(null);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { data: auth, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !auth.session) {
      setError("Sign in to view your profile.");
      setLoading(false);
      return;
    }
    if (loadedUserId.current && loadedUserId.current !== auth.session.user.id) {
      clearOwnerState();
    }

    const groupKey = `profile:${auth.session.user.id}:${selectedGroupId ?? "auto"}`;
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
        const search = new URLSearchParams({ ...deviceTimeQuery(), view: "profile" });
        if (selectedGroupId) search.set("groupId", selectedGroupId);
        const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
          headers: { Authorization: `Bearer ${auth.session.access_token}` },
          signal: AbortSignal.timeout(7_500),
        });
        const body = (await response.json()) as ProfileData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Profile could not be loaded.");
        if (latestRequestKey.current !== requestKey) return;
        dataRef.current = body;
        loadedUserId.current = auth.session.user.id;
        lastSuccessfulLoad.current = {
          key: `profile:${auth.session.user.id}:${body.selectedGroupId ?? "none"}`,
          loadedAt: Date.now(),
          workoutRevision,
        };
        setData(body);
        setSelectedGroupId(body.selectedGroupId);
        setStaleAt(null);
      } catch (loadError) {
        if (latestRequestKey.current === requestKey) {
          if (dataRef.current) {
            setStaleAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
          } else {
            setError(loadError instanceof Error ? loadError.message : "Profile could not be loaded.");
          }
        }
      } finally {
        if (latestRequestKey.current === requestKey) setLoading(false);
      }
    })().finally(() => inFlightRequests.current.delete(requestKey));
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [clearOwnerState, selectedGroupId, setSelectedGroupId]);

  const loadGoals = useCallback(async () => {
    if (__DEV__ && isLayoutPreview()) {
      setGoals({ active: [], history: [], activeCount: 0, cap: MAX_ACTIVE_GOALS });
      setGoalsLoading(false);
      return;
    }
    setGoalsLoading(true);
    setGoalsError(null);
    try {
      setGoals(await listGoals());
    } catch (loadError) {
      setGoalsError(loadError instanceof Error ? loadError.message : "Goals could not be loaded.");
    } finally {
      setGoalsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await fetchOwnedWorkoutStats());
    } catch (loadError) {
      setStatsError(loadError instanceof Error ? loadError.message : profileDashboardCopy.statsErrorTitle);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      const page = await fetchOwnedWorkouts({ limit: 3 });
      setRecent(page.workouts);
    } catch (loadError) {
      setRecentError(loadError instanceof Error ? loadError.message : profileDashboardCopy.workoutsErrorTitle);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const loadBests = useCallback(async () => {
    setBestsLoading(true);
    setBestsError(null);
    try {
      const page = await fetchOwnedPersonalRecords();
      setBests(page.bests);
    } catch (loadError) {
      setBestsError(loadError instanceof Error ? loadError.message : profileDashboardCopy.bestsErrorTitle);
    } finally {
      setBestsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadProfile();
    void loadGoals();
    void loadStats();
    void loadRecent();
    void loadBests();
  }, [loadBests, loadGoals, loadProfile, loadRecent, loadStats]);

  useFocusEffect(useCallback(() => {
    refreshAll();
  }, [refreshAll]));

  const displayName = useMemo(() => resolveUserDisplayName({ displayName: data?.user.displayName }), [data]);
  const initials = useMemo(() => getUserInitials({ displayName: data?.user.displayName }), [data]);
  const contentPaddingBottom = stripPresent ? insets.bottom + spacing.xxl : insets.bottom + size.primary + spacing.xxl;
  const weekCount = stats?.week.workoutCount ?? data?.snapshot.workoutsThisWeek ?? 0;

  const openWorkout = useCallback((sessionId: string) => {
    router.push(`/history/${sessionId}`);
  }, [router]);

  const openBest = useCallback((best: CurrentBest) => {
    if (!best.sourceAvailable || !best.sourceSessionId) return;
    router.push(`/history/${best.sourceSessionId}`);
  }, [router]);

  if (loading && !data) {
    return (
      <View style={styles.safeArea}>
        <SafeAreaView edges={["top"]} style={styles.flex}>
          <TwoPane column="readable" fallback="hide-right" left={<LoadingState message="Loading profile…" />} right={<View />} />
        </SafeAreaView>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.safeArea}>
        <SafeAreaView edges={["top"]} style={styles.flex}>
          <TwoPane
            column="readable"
            fallback="hide-right"
            left={(
              <View style={styles.state}>
                <StateCard actionLabel="Try again" message={error} onAction={refreshAll} title="Profile unavailable" />
              </View>
            )}
            right={<View />}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (!data) return null;

  const identity = (
    <View style={styles.identityPane}>
      <BrandHeader />
      {staleAt ? <StaleBanner onRetry={refreshAll} time={staleAt} /> : null}
      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <IdentitySubtitle count={weekCount} />
          </View>
        </View>
      </Card>
      {statsError && !stats ? (
        <StateCard
          actionLabel={profileDashboardCopy.tryAgain}
          message={profileDashboardCopy.errorBody}
          onAction={() => void loadStats()}
          title={profileDashboardCopy.statsErrorTitle}
        />
      ) : (
        <TotalsCard
          distanceUnit={distanceUnit}
          loading={statsLoading}
          month={stats?.month ?? null}
          onChangeUnit={setDistanceUnit}
          onOpenHelp={() => setHelpOpen(true)}
          week={stats?.week ?? null}
        />
      )}
    </View>
  );

  const dashboard = (
    <View style={[styles.lists, !twoPane && styles.listsStacked]}>
      <GoalsSection
        cap={goals?.cap ?? MAX_ACTIVE_GOALS}
        error={goalsError}
        goals={goals}
        loading={goalsLoading}
        onAdd={() => router.push("/goals/new")}
        onHistory={() => router.push("/goals/history")}
        onOpen={(goalId) => router.push(`/goals/${goalId}`)}
        onRetry={() => void loadGoals()}
      />
      <RecentWorkoutsSection
        error={recentError}
        loading={recentLoading}
        onOpen={openWorkout}
        onRetry={() => void loadRecent()}
        onViewAll={() => router.push("/history")}
        timeZone={stats?.timeZone ?? deviceTimeQuery().timeZone}
        workouts={recent}
      />
      <CurrentBestsPreview
        bests={bests}
        error={bestsError}
        loading={bestsLoading}
        onOpen={openBest}
        onRetry={() => void loadBests()}
        onViewAll={() => router.push("/bests")}
      />
      <CrewsBlock
        groups={data.groups}
        onJoin={() => router.push("/groups/join")}
        onOpen={(groupId) => {
          setSelectedGroupId(groupId);
          router.push(`/groups/${groupId}`);
        }}
      />
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Account</Text>
        <Card style={styles.listCard}>
          <ListRow label="Settings" onPress={() => router.push("/settings")} />
        </Card>
      </View>
    </View>
  );

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <TwoPane
          column="readable"
          contentPaddingBottom={contentPaddingBottom}
          fallback="stack"
          left={identity}
          right={dashboard}
        />
      </SafeAreaView>
      <TotalsHelpSheet
        onDismiss={() => setHelpOpen(false)}
        timeZoneLabel={stats?.timeZoneLabel ?? "your time zone"}
        visible={helpOpen}
        week={stats ? coverageInput(stats.week, distanceUnit) : coverageInput({
          period: "week",
          start: "",
          end: "",
          rangeLabel: "",
          workoutCount: 0,
          recordedSeconds: null,
          recordedMeters: null,
          missingDurationCount: 0,
          distanceWorkoutCount: 0,
          distanceWithValueCount: 0,
          loggedDistanceUnits: [],
        }, distanceUnit)}
        weekTimeLabel={stats ? formatTotalsTime(coverageInput(stats.week, distanceUnit)) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  state: { flexGrow: 1, justifyContent: "center" },
  identityPane: { flexGrow: 1, gap: spacing.lg },
  identity: { alignItems: "center", flexDirection: "row" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.lg,
    justifyContent: "center",
    width: size.avatars.lg,
  },
  avatarText: { color: colors.brand, ...type.title },
  identityCopy: { flex: 1, marginLeft: spacing.lg },
  name: { color: colors.ink, ...type.title },
  lists: { flexGrow: 1, gap: spacing.xxl },
  listsStacked: { marginTop: spacing.xxl },
  block: { gap: spacing.sm },
  blockTitle: { color: colors.ink, ...type.section },
  listCard: { overflow: "hidden", padding: 0 },
});
