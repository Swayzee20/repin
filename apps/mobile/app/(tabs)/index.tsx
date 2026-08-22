import type { HomeData, WorkoutFeedItem } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { normalizeInviteRedirect } from "../../lib/invite-route";
import { useMainTabs } from "../../ui/main-tabs-context";
import { Button, Card, LoadingState, StateCard, TextField, WorkoutSummaryCard } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function HomeScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { setSelectedGroupId: setTabGroupId } = useMainTabs();
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

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
      if (data.session && inviteRedirect) router.replace(inviteRedirect);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setAuthLoading(false); setHomeData(null); setSelectedGroupId(null);
      if (nextSession && inviteRedirect) router.replace(inviteRedirect);
    });
    return () => subscription.subscription.unsubscribe();
  }, [inviteRedirect, router]);

  const loadHome = useCallback(async () => {
    if (!session || inviteRedirect) return;
    setHomeLoading(true); setHomeError(null);
    try {
      const search = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) });
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
      setHomeData(body); setSelectedGroupId(body.selectedGroupId); setTabGroupId(body.selectedGroupId);
    } catch (error) { setHomeError(error instanceof Error ? error.message : "Home could not be loaded."); }
    finally { setHomeLoading(false); }
  }, [inviteRedirect, router, selectedGroupId, session, setTabGroupId]);

  useFocusEffect(useCallback(() => { if (session) void loadHome(); }, [loadHome, session]));

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
  const latestWorkout = homeData.communityWorkouts[0] ?? null;
  const highlights = deriveWeeklyHighlights(homeData.communityWorkouts, latestWorkout);
  const compactDashboard = windowHeight < 760;
  const standaloneIosWeb = isStandaloneIosWebApp();
  const visibleHighlights = highlights.slice(0, windowHeight < 850 ? 2 : 3);

  return (
    <SafeAreaView style={[styles.safeArea, styles.homeSafeArea]}>
      <View style={[styles.dashboard, compactDashboard && styles.dashboardCompact]}>
      <View style={[styles.personalZone, compactDashboard && styles.personalZoneCompact, standaloneIosWeb && styles.personalZoneStandalone]}>
        <View style={[styles.header, compactDashboard && styles.headerCompact]}>
          <View style={styles.headerCopy}><Text style={styles.brand}>REPIN</Text><Text numberOfLines={1} style={styles.greeting}>Hey, {homeData.user.displayName}</Text></View>
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
          {homeData.snapshot.mostRecentWorkoutToday ? <Text numberOfLines={1} style={styles.latestLine}>Latest: {homeData.snapshot.mostRecentWorkoutToday.title} · {homeData.snapshot.mostRecentWorkoutToday.durationMinutes} min</Text> : null}
        </Card>
      </View>

      <View style={[styles.communityZone, compactDashboard && styles.communityZoneCompact]}>
        <Text style={styles.crewEyebrow}>YOUR CREW</Text>
        <View style={[styles.sectionHeader, compactDashboard && styles.sectionHeaderCompact]}>
          <Text style={styles.sectionTitle}>Activity</Text>
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
        {latestWorkout ? (
          <View style={[styles.latestWorkout, compactDashboard && styles.latestWorkoutCompact]}>
            <WorkoutSummaryCard workout={latestWorkout} />
          </View>
        ) : (
          <View style={[styles.emptySnapshot, compactDashboard && styles.emptySnapshotCompact]}>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyCopy}>Be the first in your group to get some reps in.</Text>
            {selectedGroup ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`/groups/${selectedGroup.id}/log-workout`)}>
                <Text style={styles.emptyAction}>Log workout</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <Text style={[styles.highlightsTitle, compactDashboard && styles.highlightsTitleCompact]}>Highlights</Text>
        {visibleHighlights.length ? (
          <View>
            {visibleHighlights.map((highlight, index) => (
              <View key={highlight.userId} style={[styles.highlightRow, compactDashboard && styles.highlightRowCompact, index < visibleHighlights.length - 1 && styles.highlightDivider]}>
                <View style={styles.highlightAvatar}><Text style={styles.highlightAvatarText}>{initials(highlight.displayName)}</Text></View>
                <Text style={styles.highlightMessage}>
                  <Text style={styles.highlightName}>{highlight.displayName}</Text>
                  {` logged at least ${highlight.count} workouts this week`}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noHighlights}>No highlights yet. Keep getting those reps in.</Text>
        )}
      </View>
      </View>
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
    const completedAt = new Date(workout.completedAt);
    if (completedAt < weekStart || completedAt > now) return;
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";
}

function isStandaloneIosWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 160 }, centered: { justifyContent: "center" },
  homeSafeArea: { backgroundColor: "#F7F2F2", ...Platform.select({ web: { paddingBottom: 0 } }) },
  dashboard: { backgroundColor: colors.surface, flex: 1, paddingBottom: spacing.huge + spacing.xxxl, paddingHorizontal: spacing.xxl },
  dashboardCompact: { paddingBottom: spacing.xxxl * 2 },
  personalZone: { backgroundColor: "#F7F2F2", marginHorizontal: -spacing.xxl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
  personalZoneCompact: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  personalZoneStandalone: { paddingTop: spacing.xxl },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xxl }, headerCopy: { flex: 1, marginRight: spacing.lg },
  headerCompact: { marginBottom: spacing.sm },
  brand: { color: colors.brand, ...type.eyebrow }, greeting: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  snapshot: { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.lg }, snapshotTop: { alignItems: "center", flexDirection: "row" }, statusIcon: { alignItems: "center", borderRadius: radii.md, height: 40, justifyContent: "center", width: 40 },
  snapshotCompact: { padding: spacing.md },
  doneIcon: { backgroundColor: colors.brandSoft }, pendingIcon: { backgroundColor: colors.brandSoft }, doneGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 17 }, pendingGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 24, marginTop: -7 },
  snapshotCopy: { flex: 1, marginLeft: spacing.md }, snapshotStatus: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 }, snapshotMessage: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  weekStat: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, marginLeft: spacing.md, minWidth: 72, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, weekNumber: { color: colors.brand, fontFamily: fonts.bold, fontSize: 26, lineHeight: 30 }, weekLabel: { color: colors.brandPressed, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  latestLine: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 13, marginTop: spacing.md, paddingTop: spacing.md },
  communityZone: { backgroundColor: colors.surface, marginHorizontal: -spacing.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.sm },
  communityZoneCompact: { paddingTop: spacing.xs },
  crewEyebrow: { color: colors.brand, ...type.eyebrow },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  sectionHeaderCompact: { marginTop: 0 },
  sectionTitle: { color: colors.ink, ...type.title },
  sectionAction: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  latestWorkout: { marginTop: spacing.lg },
  latestWorkoutCompact: { marginTop: spacing.sm },
  emptySnapshot: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingBottom: spacing.xl, paddingTop: spacing.lg },
  emptySnapshotCompact: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  emptyTitle: { color: colors.ink, ...type.heading },
  emptyCopy: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  emptyAction: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, marginTop: spacing.md },
  highlightsTitle: { color: colors.ink, ...type.title, marginTop: spacing.xl },
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
