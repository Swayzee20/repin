import type { HomeData } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { normalizeInviteRedirect } from "../../lib/invite-route";
import { useMainTabs } from "../../ui/main-tabs-context";
import { Button, Card, CommunityFeed, LoadingState, StateCard, TextField } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type CommunityBoardZoomSourceProps = {
  children: (onExpand?: (event: GestureResponderEvent) => void) => ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
};

function CommunityBoardZoomSource({ children, onPress }: CommunityBoardZoomSourceProps) {
  return children(onPress);
}

export default function HomeScreen() {
  const router = useRouter();
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
  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
      if (data.session && inviteRedirect) router.replace(inviteRedirect);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setAuthLoading(false); setHomeData(null); setSelectedGroupId(null); setShowCreateGroup(false);
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

  const createGroup = useCallback(async () => {
    if (!session || !groupName.trim()) return;
    setCreatingGroup(true); setHomeError(null);
    try {
      const response = await fetch(`${apiUrl}/api/groups`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName }), signal: AbortSignal.timeout(5_000),
      });
      const body = (await response.json()) as { error?: string; group?: { id: string } };
      if (!response.ok || !body.group) throw new Error(body.error ?? "Group could not be created.");
      setGroupName(""); setShowCreateGroup(false); setSelectedGroupId(body.group.id);
    } catch (error) { setHomeError(error instanceof Error ? error.message : "Group could not be created."); }
    finally { setCreatingGroup(false); }
  }, [groupName, session]);

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

  const renderCommunityBoard = (onExpand?: (event: GestureResponderEvent) => void) => (
    <View
      collapsable={false}
      style={[
        styles.communitySection,
        selectedGroup ? styles.communityBoardSection : styles.communityOnboardingSection,
      ]}
    >
      {homeData.groups.length === 0 ? (
        <Card style={styles.onboardingCard}>
          <Text style={styles.onboardingEyebrow}>YOUR COMMUNITY STARTS HERE</Text><Text style={styles.onboardingTitle}>Find your crew</Text>
          <Text style={styles.bodyMuted}>Join an existing group to train together, or start one of your own.</Text>
          <Button onPress={() => router.push("./groups/join")}>Join a Group</Button><Button onPress={() => setShowCreateGroup(true)} variant="secondary">Create a Group</Button>
        </Card>
      ) : (
        <View style={styles.boardViewport}>
          <View pointerEvents="none" style={styles.boardSurface}>
            <View style={styles.boardToneTop} />
            <View style={styles.boardToneBottom} />
          </View>
          {selectedGroup ? (
            <View style={styles.boardHeader}>
              {homeData.groups.length > 1 ? (
                <Pressable
                  accessibilityLabel={`Selected group: ${selectedGroup.name}. Change group`}
                  accessibilityRole="button"
                  onPress={() => setGroupPickerOpen((value) => !value)}
                  style={({ pressed }) => [styles.groupSelector, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.selectedGroupName}>{selectedGroup.name}</Text>
                  <Text style={styles.chevron}>{groupPickerOpen ? "▴" : "▾"}</Text>
                </Pressable>
              ) : (
                <Text numberOfLines={1} style={styles.singleGroupName}>{selectedGroup.name}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={onExpand ?? (() => router.push(`/community/${selectedGroup.id}`))}
              >
                <Text style={styles.expandLink}>Expand ↗</Text>
              </Pressable>
            </View>
          ) : null}
          {groupPickerOpen && homeData.groups.length > 1 ? (
            <View style={styles.groupDrawer}>
              {homeData.groups.map((group) => {
                const selected = group.id === homeData.selectedGroupId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={group.id}
                    onPress={() => {
                      setSelectedGroupId(group.id);
                      setTabGroupId(group.id);
                      setGroupPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.drawerOption,
                      selected && styles.drawerOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.optionCopy}>
                      <Text numberOfLines={1} style={styles.optionName}>{group.name}</Text>
                      <Text style={styles.optionRole}>{group.role}</Text>
                    </View>
                    {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {homeLoading ? <ActivityIndicator color={colors.brand} style={styles.refreshing} /> : null}
          {homeError ? <Text style={styles.error}>{homeError}</Text> : null}
          {homeData.communityWorkouts.length === 0 ? (
            <View style={styles.boardEmptyState}>
              <StateCard title="The board is quiet" message="Log a workout to get the conversation started." />
            </View>
          ) : (
            <CommunityFeed mode="preview" workouts={homeData.communityWorkouts} />
          )}
        </View>
      )}
    </View>
  );

  return (
    <Shell>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.brand}>REPIN</Text><Text numberOfLines={1} style={styles.greeting}>Hey, {homeData.user.displayName}</Text></View>
      </View>

      <Card style={styles.snapshot}>
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

      <Text style={styles.communityTitle}>Community Board</Text>
      {selectedGroup ? (
        <Link href={`/community/${selectedGroup.id}`} asChild>
          <Link.AppleZoom>
            <CommunityBoardZoomSource>{renderCommunityBoard}</CommunityBoardZoomSource>
          </Link.AppleZoom>
        </Link>
      ) : renderCommunityBoard()}

      {homeData.groups.length > 0 ? <View style={styles.groupActions}>
        <Button onPress={() => router.push("./groups/join")}>Join another group</Button>
        <Pressable accessibilityRole="button" onPress={() => setShowCreateGroup((value) => !value)} style={styles.textAction}><Text style={styles.link}>{showCreateGroup ? "Cancel" : "Create a group"}</Text></Pressable>
      </View> : null}
      {homeData.groups.length > 0 || showCreateGroup ? <Card style={styles.createCard}>
        <Text style={styles.createTitle}>{homeData.groups.length > 0 ? "Create another group" : "Create a group"}</Text>
        <TextField maxLength={80} onChangeText={setGroupName} placeholder="Group name" value={groupName} />
        <Button disabled={!groupName.trim()} loading={creatingGroup} onPress={() => void createGroup()}>Create Group</Button>
      </Card> : null}

    </Shell>
  );
}

function Shell({ children, centered = false, flat = false }: { children: ReactNode; centered?: boolean; flat?: boolean }) {
  return <SafeAreaView style={[styles.safeArea, flat && styles.loginBackground]}><ScrollView contentContainerStyle={[styles.container, centered && styles.centered]} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={flat ? styles.loginBackground : undefined}>{children}</ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 160 }, centered: { justifyContent: "center" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xxl }, headerCopy: { flex: 1, marginRight: spacing.lg },
  brand: { color: colors.brand, ...type.eyebrow }, greeting: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  snapshot: { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.lg }, snapshotTop: { alignItems: "center", flexDirection: "row" }, statusIcon: { alignItems: "center", borderRadius: radii.md, height: 40, justifyContent: "center", width: 40 },
  doneIcon: { backgroundColor: colors.brandSoft }, pendingIcon: { backgroundColor: colors.brandSoft }, doneGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 17 }, pendingGlyph: { color: colors.brand, fontFamily: fonts.bold, fontSize: 24, marginTop: -7 },
  snapshotCopy: { flex: 1, marginLeft: spacing.md }, snapshotStatus: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 }, snapshotMessage: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  weekStat: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, marginLeft: spacing.md, minWidth: 72, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, weekNumber: { color: colors.brand, fontFamily: fonts.bold, fontSize: 26, lineHeight: 30 }, weekLabel: { color: colors.brandPressed, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  latestLine: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 13, marginTop: spacing.md, paddingTop: spacing.md },
  communitySection: {
    overflow: "visible",
  },
  communityBoardSection: { marginHorizontal: -spacing.sm, paddingTop: spacing.lg },
  communityOnboardingSection: { padding: spacing.lg },
  communityTitle: { color: colors.ink, ...type.title, marginTop: spacing.xxl },
  boardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, minHeight: 40, paddingHorizontal: spacing.lg },
  boardViewport: { borderRadius: radii.xl, minHeight: 320, overflow: "visible" },
  boardEmptyState: { justifyContent: "center", minHeight: 320 },
  boardSurface: {
    backgroundColor: colors.board,
    borderColor: colors.boardBorder,
    borderRadius: radii.xl,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  boardToneTop: { backgroundColor: "rgba(255,255,255,0.40)", borderRadius: 120, height: 180, position: "absolute", right: -70, top: -90, width: 220 },
  boardToneBottom: { backgroundColor: "rgba(232,93,93,0.045)", borderRadius: 140, bottom: -90, height: 210, left: -90, position: "absolute", width: 250 },
  link: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  expandLink: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },
  groupSelector: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.boardBorder, borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", flexShrink: 1, marginRight: spacing.md, maxWidth: "78%", minHeight: 36, paddingHorizontal: spacing.md },
  selectedGroupName: { color: colors.inkSoft, flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14 },
  chevron: { color: colors.brand, fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, marginLeft: spacing.sm, textAlignVertical: "center" },
  singleGroupName: { color: colors.ink, flex: 1, fontFamily: fonts.semibold, fontSize: 16, marginRight: spacing.md },
  groupDrawer: {
    backgroundColor: colors.surface,
    borderColor: colors.boardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.xs,
  },
  drawerOption: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  drawerOptionSelected: { backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.76 }, refreshing: { marginBottom: spacing.md }, error: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
  onboardingCard: { gap: spacing.md, padding: spacing.xl }, onboardingEyebrow: { color: colors.brand, ...type.eyebrow }, onboardingTitle: { color: colors.ink, ...type.title }, bodyMuted: { color: colors.muted, ...type.body },
  groupActions: { gap: spacing.sm, marginTop: spacing.xxl }, textAction: { alignItems: "center", justifyContent: "center", minHeight: 44 }, createCard: { gap: spacing.lg, marginTop: spacing.lg }, createTitle: { color: colors.ink, ...type.heading },
  authIntro: { alignItems: "flex-start", marginBottom: spacing.xxxl, marginTop: spacing.huge }, authBrand: { color: colors.brand, ...type.eyebrow },
  authTitle: { color: colors.ink, ...type.display, marginTop: spacing.xxl }, authCopy: { color: colors.muted, ...type.body, marginTop: spacing.sm }, authForm: { gap: spacing.lg }, authInput: { borderRadius: 9 }, authInputFocused: { borderColor: colors.brand }, authButton: { borderRadius: 10 }, loginBackground: { backgroundColor: colors.surface },
  signupPrompt: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xxl }, signupCopy: { color: colors.muted, ...type.bodySmall }, signupLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  optionCopy: { flex: 1 }, optionName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 }, optionRole: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: spacing.xs, textTransform: "capitalize" },
  checkmark: { color: colors.brand, fontFamily: fonts.bold, fontSize: 18, marginLeft: spacing.md },
});
