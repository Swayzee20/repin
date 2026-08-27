import { getUserInitials, resolveUserDisplayName, type HomeData, type WorkoutFeedItem } from "@repin/types";
import { Feather } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { normalizeInviteRedirect } from "../../lib/invite-route";
import { resolveWorkoutDate } from "../../lib/workout-date";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../lib/data-freshness";
import { useMainTabs } from "../../ui/main-tabs-context";
import { BrandHeader, Button, Card, LoadingState, StateCard, TextField, WorkoutSummaryCard } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function HomeScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { openWorkoutChooser, setSelectedGroupId: setTabGroupId } = useMainTabs();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
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
        router.replace("./onboarding/groups");
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

  const signIn = useCallback(async () => {
    if (!supabase) return;
    setAuthLoading(true); setAuthMessage(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) setAuthMessage(error.message);
    else if (data.session && inviteRedirect) router.replace(inviteRedirect);
  }, [email, inviteRedirect, password, router]);

  const selectedGroup = useMemo(() => homeData?.groups.find((group) => group.id === homeData.selectedGroupId), [homeData]);

  if (!isSupabaseConfigured) return <Shell><StateCard title="Supabase is not configured" message="Add the Expo public Supabase URL and publishable key to the mobile environment file." /></Shell>;
  if (authLoading && !session) return <Shell><LoadingState message="Checking your account…" /></Shell>;
  if (!session) return (
    <Shell flat>
      <View style={styles.authIntro}>
        <Text style={styles.authBrand}>REPIN</Text>
        <Text style={styles.authTitle}>Welcome back</Text>
        <Text style={styles.authCopy}>Log in to your RepIn account.</Text>
      </View>
      <View style={styles.authForm}>
        <TextField autoCapitalize="none" autoComplete="email" inputMode="email" label="Email" onBlur={() => setEmailFocused(false)} onChangeText={setEmail} onFocus={() => setEmailFocused(true)} placeholder="you@example.com" style={[styles.authInput, emailFocused && styles.authInputFocused]} value={email} />
        <TextField autoCapitalize="none" autoComplete="password" label="Password" onBlur={() => setPasswordFocused(false)} onChangeText={setPassword} onFocus={() => setPasswordFocused(true)} placeholder="Enter your password" secureTextEntry style={[styles.authInput, passwordFocused && styles.authInputFocused]} value={password} />
        {authMessage ? <Text style={styles.error}>{authMessage}</Text> : null}
        <Button disabled={!email || !password} loading={authLoading} onPress={() => void signIn()} style={styles.authButton}>Sign in</Button>
      </View>
      <View style={styles.signupPrompt}>
        <Text style={styles.signupCopy}>Don’t have an account?</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: "/signup", params: inviteRedirect ? { redirect: inviteRedirect } : undefined })}>
          <Text style={styles.signupLink}>Create account</Text>
        </Pressable>
      </View>
    </Shell>
  );
  if (homeLoading && !homeData) return <Shell><LoadingState message="Loading your community…" /></Shell>;
  if (homeError && !homeData) return <Shell><StateCard actionLabel="Try again" message={homeError} onAction={() => void loadHome()} title="Home unavailable" /></Shell>;
  if (!homeData) return null;
  const latestCommunityWorkout = homeData.communityWorkouts[0] ?? null;
  const latestWorkoutToday = homeData.communityWorkouts.find(isWorkoutFromToday) ?? null;
  const highlights = deriveWeeklyHighlights(homeData.communityWorkouts, latestCommunityWorkout);
  const compactDashboard = windowHeight < 760;
  const standaloneIosWeb = isStandaloneIosWebApp();
  const visibleHighlights = highlights.slice(0, windowHeight < 850 ? 2 : 3);
  const consistencyDays = buildWeeklyConsistencyDays(
    homeData.snapshot.workoutOccurredAtThisWeek,
  );

  return (
    <SafeAreaView style={[styles.safeArea, styles.homeSafeArea]}>
      <ScrollView
        contentContainerStyle={[styles.dashboard, compactDashboard && styles.dashboardCompact]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.personalZone, compactDashboard && styles.personalZoneCompact, standaloneIosWeb && styles.personalZoneStandalone]}>
        <View style={[styles.header, compactDashboard && styles.headerCompact]}>
          <View style={styles.headerCopy}><BrandHeader /><Text numberOfLines={1} style={styles.greeting}>Hey, {getGreetingFirstName(homeData.user.displayName)}</Text></View>
        </View>

        <Card style={[styles.snapshot, compactDashboard && styles.snapshotCompact]}>
          <View style={styles.snapshotTop}>
            <View style={[styles.statusIcon, homeData.snapshot.hasWorkoutToday ? styles.doneIcon : styles.pendingIcon]}>
              <Text style={homeData.snapshot.hasWorkoutToday ? styles.doneGlyph : styles.pendingGlyph}>{homeData.snapshot.hasWorkoutToday ? "✓" : "·"}</Text>
            </View>
            <View style={styles.snapshotCopy}>
              <Text style={styles.snapshotStatus}>{homeData.snapshot.hasWorkoutToday ? "Workout logged today" : "Ready when you are"}</Text>
              <Text numberOfLines={2} style={styles.snapshotMessage}>{homeData.snapshot.message}</Text>
            </View>
            <View style={styles.weekStat}><Text style={styles.weekNumber}>{homeData.snapshot.workoutsThisWeek}</Text><Text style={styles.weekLabel}>THIS WEEK</Text></View>
          </View>
          {homeData.snapshot.mostRecentWorkoutToday ? <Text numberOfLines={1} style={styles.latestLine}>Latest: {homeData.snapshot.mostRecentWorkoutToday.title}{homeData.snapshot.mostRecentWorkoutToday.durationMinutes ? ` · ${homeData.snapshot.mostRecentWorkoutToday.durationMinutes} min` : ""}</Text> : null}
        </Card>

        <View accessibilityRole="list" style={styles.consistencyRow}>
          {consistencyDays.map((day) => (
            <View
              accessibilityLabel={day.accessibilityLabel}
              accessible
              key={day.key}
              style={styles.consistencyDay}
            >
              <Text style={styles.consistencyWeekday}>{day.weekday}</Text>
              <View style={[styles.consistencyRing, day.isToday && (day.completed ? styles.consistencyRingTodayCompleted : styles.consistencyRingToday)]}>
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
      </View>

      <View style={[styles.communityZone, compactDashboard && styles.communityZoneCompact]}>
        <Text style={styles.crewEyebrow}>YOUR CREW</Text>
        <View style={[styles.sectionHeader, compactDashboard && styles.sectionHeaderCompact]}>
          <Text style={styles.subsectionTitle}>Activity</Text>
          {selectedGroup ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setTabGroupId(selectedGroup.id);
                router.navigate("/community");
              }}
            >
              <Text style={styles.sectionAction}>View all</Text>
            </Pressable>
          ) : null}
        </View>
        {homeLoading ? <ActivityIndicator color={colors.brand} style={styles.refreshing} /> : null}
        {homeError ? <Text style={styles.error}>{homeError}</Text> : null}
        {latestWorkoutToday ? (
          <View style={[styles.latestWorkout, compactDashboard && styles.latestWorkoutCompact]}>
            <WorkoutSummaryCard variant="compact" workout={latestWorkoutToday} />
          </View>
        ) : (
          <View style={[styles.emptySnapshot, compactDashboard && styles.emptySnapshotCompact]}>
            <Feather color={colors.brand} name="activity" size={18} />
            <Text style={styles.emptyCopy}>No workouts logged yet</Text>
            <Text style={styles.emptyTitle}>Be the first to check in</Text>
            {selectedGroup ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={openWorkoutChooser} style={({ pressed }) => [styles.emptyAction, pressed && styles.emptyActionPressed]}>
                <Feather color={colors.surface} name="plus" size={14} />
                <Text style={styles.emptyActionText}>Check in</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <Text style={[styles.subsectionTitle, styles.highlightsTitle, compactDashboard && styles.highlightsTitleCompact]}>Highlights</Text>
        {visibleHighlights.length ? (
          <View>
            {visibleHighlights.map((highlight, index) => (
              <View key={highlight.userId} style={[styles.highlightRow, compactDashboard && styles.highlightRowCompact, index < visibleHighlights.length - 1 && styles.highlightDivider]}>
                <View style={styles.highlightAvatar}><Text style={styles.highlightAvatarText}>{getUserInitials({ displayName: highlight.displayName })}</Text></View>
                <Text style={styles.highlightMessage}>
                  <Text style={styles.highlightName}>{resolveUserDisplayName({ displayName: highlight.displayName })}</Text>
                  {` logged at least ${highlight.count} workouts this week`}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noHighlights}>No highlights yet. Keep getting those reps in.</Text>
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Shell({ children, centered = false, flat = false }: { children: ReactNode; centered?: boolean; flat?: boolean }) {
  return <SafeAreaView style={[styles.safeArea, flat && styles.loginBackground]}><ScrollView contentContainerStyle={[styles.container, centered && styles.centered]} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={flat ? styles.loginBackground : undefined}>{children}</ScrollView></SafeAreaView>;
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
    const status = `${isToday ? "today, " : ""}${completed ? "workout completed" : "no workout logged"}`;

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
  safeArea: { backgroundColor: colors.background, flex: 1 }, container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 160 }, centered: { justifyContent: "center" },
  homeSafeArea: { backgroundColor: "#F7F2F2", ...Platform.select({ web: { paddingBottom: 0 } }) },
  dashboard: { backgroundColor: colors.surface, flexGrow: 1, paddingBottom: 160, paddingHorizontal: spacing.xxl },
  dashboardCompact: { paddingBottom: 160 },
  personalZone: { backgroundColor: "#F7F2F2", marginHorizontal: -spacing.xxl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
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
  consistencyRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  consistencyDay: { alignItems: "center", flex: 1 },
  consistencyWeekday: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, lineHeight: 16 },
  consistencyRing: { alignItems: "center", borderColor: "transparent", borderRadius: radii.pill, borderWidth: 1, height: 34, justifyContent: "center", marginTop: spacing.xs, width: 34 },
  consistencyRingToday: { borderColor: colors.inkSoft },
  consistencyRingTodayCompleted: { borderColor: colors.brandPressed },
  consistencyCircle: { alignItems: "center", borderRadius: radii.pill, borderWidth: 1, height: 26, justifyContent: "center", width: 26 },
  consistencyCircleCompleted: { backgroundColor: colors.brand, borderColor: colors.brand },
  consistencyCircleToday: { backgroundColor: colors.surface, borderColor: colors.inkSoft },
  consistencyCirclePast: { backgroundColor: colors.border, borderColor: colors.borderStrong },
  consistencyCircleFuture: { backgroundColor: colors.surface, borderColor: colors.border },
  communityZone: { backgroundColor: colors.surface, marginHorizontal: -spacing.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.sm },
  communityZoneCompact: { paddingTop: spacing.xs },
  crewEyebrow: { color: colors.brand, ...type.heading },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  sectionHeaderCompact: { marginTop: 0 },
  subsectionTitle: { color: colors.ink, ...type.bodyMedium, fontFamily: fonts.semibold },
  sectionAction: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  latestWorkout: { marginTop: spacing.lg },
  latestWorkoutCompact: { marginTop: spacing.sm },
  emptySnapshot: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.lg },
  emptySnapshotCompact: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  emptyTitle: { alignSelf: "center", color: colors.ink, ...type.heading, marginTop: spacing.sm },
  emptyCopy: { alignSelf: "center", color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  emptyAction: { alignItems: "center", alignSelf: "center", backgroundColor: colors.brand, borderRadius: radii.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.md, minHeight: 36, paddingHorizontal: spacing.md },
  emptyActionPressed: { backgroundColor: colors.brandPressed },
  emptyActionText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 13 },
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
  authIntro: { alignItems: "flex-start", marginBottom: spacing.xxxl, marginTop: spacing.huge }, authBrand: { color: colors.brand, ...type.eyebrow },
  authTitle: { color: colors.ink, ...type.display, marginTop: spacing.xxl }, authCopy: { color: colors.muted, ...type.body, marginTop: spacing.sm }, authForm: { gap: spacing.lg }, authInput: { borderRadius: 9 }, authInputFocused: { borderColor: colors.brand }, authButton: { borderRadius: 10 }, loginBackground: { backgroundColor: colors.surface },
  signupPrompt: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xxl }, signupCopy: { color: colors.muted, ...type.bodySmall }, signupLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
});
