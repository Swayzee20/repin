import { getUserInitials, resolveUserDisplayName, type HomeData, type WorkoutFeedItem } from "@repin/types";
import { Feather } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVerticalBarEdgeIOS } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { normalizeInviteRedirect } from "../../../lib/invite-route";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { resolveWorkoutDate } from "../../../lib/workout-date";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { BrandHeader, Card, LoadingState, StateCard, WorkoutSummaryCard } from "../../../ui/components";
import { CheckInEmptyContent } from "../../../ui/check-in-empty-content";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { RepInPill } from "../../../ui/rep-in-pill";
import { ScrollAnchor } from "../../../ui/scroll-anchor";
import { colors, floatingSurfaceStyle, fonts, radii, spacing, type } from "../../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function HomeScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { mode } = useLayoutMode();
  const insets = useSafeAreaInsets();
  const verticalBarEdge = useVerticalBarEdgeIOS();
  const { openWorkoutChooser, setSelectedGroupId: setTabGroupId } = useMainTabs();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const layoutPreview = isLayoutPreview();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [localDayKey, setLocalDayKey] = useState(() => getLocalDateKey(new Date()));
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
      const search = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()), view: "home" });
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
      } catch (error) {
        if (latestRequestKey.current === requestKey) {
          setHomeError(error instanceof Error ? error.message : "Home could not be loaded.");
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
      setLocalDayKey(getLocalDateKey(new Date()));
      void loadHome();
    }, nextLocalDay.getTime() - now.getTime() + 1_000);
    return () => clearTimeout(timeout);
  }, [loadHome, localDayKey]);

  const dashboardData = layoutPreview ? layoutPreviewHome() : homeData;
  const selectedGroup = useMemo(() => dashboardData?.groups.find((group) => group.id === dashboardData.selectedGroupId), [dashboardData]);
  const dashboardBottomPadding = verticalBarEdge !== null ? insets.bottom + spacing.xxl : 160;
  if (!layoutPreview && authLoading && !session) return <Shell><LoadingState message="Checking your account…" /></Shell>;
  if (!layoutPreview && !session) return null;
  if (!layoutPreview && homeLoading && !homeData) return <Shell><LoadingState message="Loading your community…" /></Shell>;
  if (!layoutPreview && homeError && !homeData) return <Shell><StateCard actionLabel="Try again" message={homeError} onAction={() => void loadHome()} title="Home unavailable" /></Shell>;
  if (!dashboardData) return null;
  const latestCommunityWorkout = dashboardData.communityWorkouts[0] ?? null;
  const latestWorkoutToday = dashboardData.communityWorkouts.find(isWorkoutFromToday) ?? null;
  const highlights = deriveWeeklyHighlights(dashboardData.communityWorkouts, latestCommunityWorkout);
  const compactDashboard = mode === "compact" && windowHeight < 760;
  const standaloneIosWeb = isStandaloneIosWebApp();
  const visibleHighlights = highlights.slice(0, mode === "twoPane" || windowHeight >= 850 ? 3 : 2);
  const crewWorkouts = mode === "twoPane" ? newestFirst(dashboardData.communityWorkouts) : [];

  return (
    <View style={[styles.safeArea, styles.homeSafeArea]}>
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <TwoPane
          column="readable"
          contentPaddingBottom={dashboardBottomPadding}
          fallback="stack"
          left={(
            <PersonalZone
              compact={compactDashboard}
              highlights={mode === "twoPane" ? visibleHighlights : null}
              homeData={dashboardData}
              standaloneIosWeb={standaloneIosWeb}
            />
          )}
          right={(
            <CrewZone
              compact={compactDashboard}
              highlights={mode === "twoPane" ? null : visibleHighlights}
              homeError={homeError}
              homeLoading={homeLoading}
              latestWorkoutToday={mode === "twoPane" ? null : latestWorkoutToday}
              onCheckIn={selectedGroup ? openWorkoutChooser : undefined}
              onViewAll={selectedGroup ? () => {
                setTabGroupId(selectedGroup.id);
                router.navigate("/community");
              } : undefined}
              workouts={crewWorkouts}
            />
          )}
        />
      </SafeAreaView>
      <RepInPill />
    </View>
  );
}

function PersonalZone({
  compact,
  highlights,
  homeData,
  standaloneIosWeb,
}: {
  compact: boolean;
  highlights: ReturnType<typeof deriveWeeklyHighlights> | null;
  homeData: HomeData;
  standaloneIosWeb: boolean;
}) {
  const consistencyDays = buildWeeklyConsistencyDays(homeData.snapshot.workoutOccurredAtThisWeek);
  return (
    <View style={[styles.personalZone, compact && styles.personalZoneCompact, standaloneIosWeb && styles.personalZoneStandalone]}>
      <ScrollAnchor id="home-greeting">
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerCopy}><BrandHeader /><Text numberOfLines={1} style={styles.greeting}>Hey, {getGreetingFirstName(homeData.user.displayName)}</Text></View>
        </View>
      </ScrollAnchor>

      <ScrollAnchor id="home-snapshot">
        <Card style={[styles.snapshot, styles.floatingSurface, compact && styles.snapshotCompact]}>
          <View style={styles.snapshotTop}>
            <View style={[styles.statusIcon, homeData.snapshot.hasWorkoutToday ? styles.doneIcon : styles.pendingIcon]}>
              <Text style={homeData.snapshot.hasWorkoutToday ? styles.doneGlyph : styles.pendingGlyph}>{homeData.snapshot.hasWorkoutToday ? "✓" : "·"}</Text>
            </View>
            <View style={styles.snapshotCopy}>
              <Text style={styles.snapshotStatus}>{homeData.snapshot.hasWorkoutToday ? "You repped in today" : "Ready when you are"}</Text>
              <Text numberOfLines={2} style={styles.snapshotMessage}>{homeData.snapshot.message}</Text>
            </View>
            <View style={styles.weekStat}><Text style={styles.weekNumber}>{homeData.snapshot.workoutsThisWeek}</Text><Text style={styles.weekLabel}>THIS WEEK</Text></View>
          </View>
          {homeData.snapshot.mostRecentWorkoutToday ? <Text numberOfLines={1} style={styles.latestLine}>Latest: {homeData.snapshot.mostRecentWorkoutToday.title}{homeData.snapshot.mostRecentWorkoutToday.durationMinutes ? ` · ${homeData.snapshot.mostRecentWorkoutToday.durationMinutes} min` : ""}</Text> : null}
        </Card>
      </ScrollAnchor>

      <ScrollAnchor id="home-week">
        <View accessibilityRole="list" style={[styles.consistencyRow, styles.floatingSurface]}>
          {consistencyDays.map((day) => (
            <View
              accessibilityLabel={day.accessibilityLabel}
              accessible
              key={day.key}
              style={styles.consistencyDay}
            >
              <Text style={[styles.consistencyWeekday, day.isToday && styles.consistencyWeekdayToday]}>{day.weekday}</Text>
              <View style={styles.consistencyMarker}>
                <View style={[
                  styles.consistencyCircle,
                  day.completed
                    ? styles.consistencyCircleCompleted
                    : day.isFuture
                      ? styles.consistencyCircleFuture
                      : day.isToday
                        ? styles.consistencyCircleToday
                        : styles.consistencyCirclePast,
                ]}>
                  {day.completed ? <Feather color={colors.surface} name="check" size={14} /> : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollAnchor>
      {highlights ? <Highlights compact={compact} highlights={highlights} /> : null}
    </View>
  );
}

function CrewZone({
  compact,
  highlights,
  homeError,
  homeLoading,
  latestWorkoutToday,
  onCheckIn,
  onViewAll,
  workouts,
}: {
  compact: boolean;
  highlights: ReturnType<typeof deriveWeeklyHighlights> | null;
  homeError: string | null;
  homeLoading: boolean;
  latestWorkoutToday: WorkoutFeedItem | null;
  onCheckIn?: () => void;
  onViewAll?: () => void;
  workouts: WorkoutFeedItem[];
}) {
  const showList = workouts.length > 0;
  return (
    <View style={[styles.communityZone, compact && styles.communityZoneCompact]}>
      <ScrollAnchor id="home-crew">
        <Text style={styles.crewEyebrow}>YOUR CREW</Text>
        <View style={[styles.sectionHeader, compact && styles.sectionHeaderCompact]}>
          <Text style={styles.subsectionTitle}>Activity</Text>
          {onViewAll ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onViewAll}>
              <Text style={styles.sectionAction}>View all</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollAnchor>
      {homeLoading ? <ActivityIndicator color={colors.brand} style={styles.refreshing} /> : null}
      {homeError ? <Text style={styles.error}>{homeError}</Text> : null}
      {showList ? workouts.map((workout) => (
        <ScrollAnchor id={`home-workout-${workout.id}`} key={workout.id}>
          <View style={[styles.latestWorkout, compact && styles.latestWorkoutCompact]}>
            <WorkoutSummaryCard style={styles.floatingSurface} variant="compact" workout={workout} />
          </View>
        </ScrollAnchor>
      )) : latestWorkoutToday ? (
        <ScrollAnchor id={`home-workout-${latestWorkoutToday.id}`}>
          <View style={[styles.latestWorkout, compact && styles.latestWorkoutCompact]}>
            <WorkoutSummaryCard style={styles.floatingSurface} variant="compact" workout={latestWorkoutToday} />
          </View>
        </ScrollAnchor>
      ) : (
        <ScrollAnchor id="home-empty">
          <View style={[styles.emptySnapshot, styles.floatingSurface, compact && styles.emptySnapshotCompact]}>
            <CheckInEmptyContent onCheckIn={onCheckIn} />
          </View>
        </ScrollAnchor>
      )}
      {highlights ? <Highlights compact={compact} highlights={highlights} /> : null}
    </View>
  );
}

function Highlights({
  compact,
  highlights,
}: {
  compact: boolean;
  highlights: ReturnType<typeof deriveWeeklyHighlights>;
}) {
  return (
    <ScrollAnchor id="home-highlights">
      <Text style={[styles.subsectionTitle, styles.highlightsTitle, compact && styles.highlightsTitleCompact]}>Highlights</Text>
      {highlights.length ? (
        <View>
          {highlights.map((highlight, index) => (
            <View key={highlight.userId} style={[styles.highlightRow, compact && styles.highlightRowCompact, index < highlights.length - 1 && styles.highlightDivider]}>
              <View style={styles.highlightAvatar}><Text style={styles.highlightAvatarText}>{getUserInitials({ displayName: highlight.displayName })}</Text></View>
              <Text style={styles.highlightMessage}>
                <Text style={styles.highlightName}>{resolveUserDisplayName({ displayName: highlight.displayName })}</Text>
                {` repped in at least ${highlight.count} times this week`}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noHighlights}>No highlights yet. Keep getting those reps in.</Text>
      )}
    </ScrollAnchor>
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

function deriveWeeklyHighlights(
  workouts: WorkoutFeedItem[],
  latestWorkout: WorkoutFeedItem | null,
) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const counts = new Map<string, { count: number; displayName: string; userId: string }>();

  workouts.forEach((workout) => {
    const occurredAt = resolveWorkoutDate(workout);
    if (!occurredAt) return;
    if (occurredAt < weekStart || occurredAt > now) return;
    const current = counts.get(workout.userId);
    counts.set(workout.userId, {
      count: (current?.count ?? 0) + 1,
      displayName: workout.displayName,
      userId: workout.userId,
    });
  });

  return [...counts.values()]
    .filter((highlight) => highlight.count >= 2)
    .sort((left, right) => {
      const leftIsLatest = left.userId === latestWorkout?.userId ? 1 : 0;
      const rightIsLatest = right.userId === latestWorkout?.userId ? 1 : 0;
      return leftIsLatest - rightIsLatest || right.count - left.count;
    })
    .slice(0, 3);
}

function layoutPreviewHome(): HomeData {
  const maya = "Maya L.";
  const jordan = "Jordan P.";
  const sam = "Sam R.";
  const workout = (
    id: string,
    displayName: string,
    userId: string,
    title: string,
    workoutType: string,
    occurredAt: string,
    durationMinutes: number | null,
    effort: number,
    caption: string | null,
  ): WorkoutFeedItem => ({
    caption,
    completedAt: occurredAt,
    createdAt: occurredAt,
    displayName,
    durationMinutes,
    effort,
    groupId: "group-1",
    id,
    name: title,
    notes: caption,
    occurredAt,
    photoPath: null,
    title,
    updatedAt: occurredAt,
    userId,
    workoutType,
  });
  const communityWorkouts = [
    workout("w1", maya, "user-maya", "Easy shakeout", "run", "2026-10-30T12:12:00.000Z", 32, 3, "Legs felt great today"),
    workout("w2", jordan, "user-jordan", "Push day", "strength_training", "2026-10-30T11:40:00.000Z", 45, 4, null),
    workout("w3", sam, "user-sam", "Hill repeats", "run", "2026-10-30T11:05:00.000Z", null, 4, null),
    workout("w4", maya, "user-maya", "Easy shakeout", "run", "2026-10-29T12:00:00.000Z", 30, 2, null),
    workout("w5", maya, "user-maya", "Easy shakeout", "run", "2026-10-28T12:00:00.000Z", 28, 2, null),
    workout("w6", jordan, "user-jordan", "Push day", "strength_training", "2026-10-28T11:00:00.000Z", 40, 3, null),
  ];
  return {
    communityWorkouts,
    groups: [{
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "group-1",
      name: "Morning Crew",
      ownerId: "user-maya",
      role: "owner",
    }],
    selectedGroupId: "group-1",
    snapshot: {
      hasWorkoutToday: true,
      message: "Three sessions already this week.",
      mostRecentWorkoutToday: communityWorkouts[0] ?? null,
      workoutOccurredAtThisWeek: [
        "2026-10-28T12:00:00.000Z",
        "2026-10-29T12:00:00.000Z",
        "2026-10-30T12:12:00.000Z",
      ],
      workoutsThisWeek: 3,
    },
    user: {
      createdAt: "2026-01-01T00:00:00.000Z",
      displayName: maya,
      id: "user-maya",
    },
  };
}

function newestFirst(workouts: WorkoutFeedItem[]) {
  return [...workouts].sort((left, right) => {
    const leftTime = resolveWorkoutDate(left)?.getTime() ?? 0;
    const rightTime = resolveWorkoutDate(right)?.getTime() ?? 0;
    return rightTime - leftTime || right.updatedAt.localeCompare(left.updatedAt);
  });
}

function getGreetingFirstName(displayName: string) {
  return resolveUserDisplayName({ displayName }).split(/\s+/)[0];
}

function isWorkoutFromToday(workout: WorkoutFeedItem) {
  const occurredAt = resolveWorkoutDate(workout);
  if (!occurredAt) return false;
  const today = new Date();
  return occurredAt.getFullYear() === today.getFullYear()
    && occurredAt.getMonth() === today.getMonth()
    && occurredAt.getDate() === today.getDate();
}

function buildWeeklyConsistencyDays(workoutOccurredAtThisWeek: string[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sunday = new Date(todayStart);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const completedDateKeys = new Set(
    workoutOccurredAtThisWeek
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(getLocalDateKey),
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    const key = getLocalDateKey(date);
    const completed = completedDateKeys.has(key);
    const isToday = date.getTime() === todayStart.getTime();
    const isFuture = date.getTime() > todayStart.getTime();
    const temporalStatus = isToday ? "today, " : isFuture ? "future day, " : "";
    const status = `${temporalStatus}${completed ? "workout completed" : "no workout logged"}`;

    return {
      accessibilityLabel: `${new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(date)}, ${status}`,
      completed,
      isFuture,
      isToday,
      key,
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toLocaleUpperCase(),
    };
  });
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function isStandaloneIosWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  homeSafeArea: { backgroundColor: colors.background, ...Platform.select({ web: { paddingBottom: 0 } }) },
  personalZone: { backgroundColor: colors.background, paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  personalZoneCompact: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  personalZoneStandalone: { paddingTop: spacing.xxl },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xxl }, headerCopy: { flex: 1, marginRight: spacing.lg },
  headerCompact: { marginBottom: spacing.sm },
  greeting: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  snapshot: { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.lg }, snapshotTop: { alignItems: "center", flexDirection: "row" }, statusIcon: { alignItems: "center", borderRadius: radii.md, height: 40, justifyContent: "center", width: 40 },
  snapshotCompact: { padding: spacing.md },
  doneIcon: { backgroundColor: colors.brandSoft }, pendingIcon: { backgroundColor: colors.brandSoft }, doneGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 17 }, pendingGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 24, marginTop: -7 },
  snapshotCopy: { flex: 1, marginLeft: spacing.md }, snapshotStatus: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 }, snapshotMessage: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  weekStat: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, marginLeft: spacing.md, minWidth: 72, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, weekNumber: { color: colors.brand, fontFamily: fonts.bold, fontSize: 26, lineHeight: 30 }, weekLabel: { color: colors.brandPressed, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  latestLine: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 13, marginTop: spacing.md, paddingTop: spacing.md },
  consistencyRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  consistencyDay: { alignItems: "center", flex: 1 },
  consistencyWeekday: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, lineHeight: 16 },
  consistencyWeekdayToday: { color: colors.inkSoft },
  consistencyMarker: { alignItems: "center", height: 34, justifyContent: "center", marginTop: spacing.xs, width: 34 },
  consistencyCircle: { alignItems: "center", borderRadius: radii.pill, borderWidth: 1, height: 26, justifyContent: "center", width: 26 },
  consistencyCircleCompleted: { backgroundColor: colors.brand, borderColor: colors.brand },
  consistencyCircleToday: { backgroundColor: colors.surfaceMuted, borderColor: colors.inkSoft },
  consistencyCirclePast: { backgroundColor: colors.borderStrong, borderColor: colors.borderStrong },
  consistencyCircleFuture: { backgroundColor: colors.surface, borderColor: colors.border },
  communityZone: { backgroundColor: colors.background, paddingTop: spacing.sm },
  communityZoneCompact: { paddingTop: spacing.xs },
  crewEyebrow: { color: colors.brand, ...type.heading },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  sectionHeaderCompact: { marginTop: 0 },
  subsectionTitle: { color: colors.ink, ...type.bodyMedium, fontFamily: fonts.semibold },
  sectionAction: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  latestWorkout: { marginTop: spacing.lg },
  latestWorkoutCompact: { marginTop: spacing.sm },
  emptySnapshot: { alignItems: "center", marginTop: spacing.lg, padding: spacing.lg },
  floatingSurface: { ...floatingSurfaceStyle },
  emptySnapshotCompact: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  highlightsTitle: { marginTop: spacing.xl },
  highlightsTitleCompact: { marginTop: spacing.xs },
  highlightRow: { alignItems: "center", flexDirection: "row", minHeight: 64, paddingVertical: spacing.md },
  highlightRowCompact: { minHeight: 44, paddingVertical: spacing.xs },
  highlightDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  highlightAvatar: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.pill, height: 36, justifyContent: "center", width: 36 },
  highlightAvatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 11 },
  highlightMessage: { color: colors.inkSoft, flex: 1, ...type.bodySmall, marginLeft: spacing.md },
  highlightName: { color: colors.ink, fontFamily: fonts.semibold },
  noHighlights: { color: colors.muted, ...type.bodySmall, marginTop: spacing.md },
  refreshing: { marginTop: spacing.md }, error: { color: colors.danger, ...type.bodySmall, marginTop: spacing.md },
});
