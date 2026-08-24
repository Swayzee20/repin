import { getUserInitials, resolveUserDisplayName, type HomeData } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { BrandHeader, LoadingState, StateCard } from "../../ui/components";
import { useMainTabs } from "../../ui/main-tabs-context";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function ProfileTabScreen() {
  const router = useRouter();
  const { selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !auth.session) throw new Error("Sign in to view your profile.");
      const search = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) });
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as HomeData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Profile could not be loaded.");
      setData(body);
      setSelectedGroupId(body.selectedGroupId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, setSelectedGroupId]);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  const displayName = useMemo(() => resolveUserDisplayName({ displayName: data?.user.displayName }), [data]);
  const initials = useMemo(() => getUserInitials({ displayName: data?.user.displayName }), [data]);

  if (loading && !data) return <SafeAreaView style={styles.safeArea}><LoadingState message="Loading profile…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safeArea}><View style={styles.state}><StateCard actionLabel="Try again" message={error} onAction={() => void loadProfile()} title="Profile unavailable" /></View></SafeAreaView>;
  if (!data) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <BrandHeader />
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.memberSince}>RepIn member since {new Date(data.user.createdAt).getFullYear()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PERSONAL ACTIVITY</Text>
          <View style={styles.activityPanel}>
            <View style={styles.activitySummary}>
              <View>
                <Text style={styles.weekCount}>{data.snapshot.workoutsThisWeek}</Text>
                <Text style={styles.weekCountLabel}>WORKOUTS THIS WEEK</Text>
              </View>
              <View style={[styles.todayStatus, data.snapshot.hasWorkoutToday && styles.todayStatusDone]}>
                <Text style={[styles.todayStatusText, data.snapshot.hasWorkoutToday && styles.todayStatusTextDone]}>
                  {data.snapshot.hasWorkoutToday ? "✓ Logged today" : "Today is open"}
                </Text>
              </View>
            </View>
            <Text style={styles.weekMessage}>{data.snapshot.message}</Text>
            {data.snapshot.mostRecentWorkoutToday ? (
            <View style={styles.activityRow}>
              <View style={styles.activityMark} />
              <View style={styles.activityCopy}>
                <Text style={styles.activityEyebrow}>LATEST TODAY</Text>
                <Text style={styles.activityTitle}>{data.snapshot.mostRecentWorkoutToday.title}</Text>
                <Text style={styles.activityMeta}>{data.snapshot.mostRecentWorkoutToday.workoutType}{data.snapshot.mostRecentWorkoutToday.durationMinutes ? ` · ${data.snapshot.mostRecentWorkoutToday.durationMinutes} min` : ""}</Text>
              </View>
            </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY GROUPS</Text>
          <View style={styles.groups}>
            {data.groups.map((group) => (
              <Pressable
                accessibilityRole="button"
                key={group.id}
                onPress={() => {
                  setSelectedGroupId(group.id);
                  router.push(`/groups/${group.id}`);
                }}
                style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}
              >
                <View style={styles.groupMark}><Text style={styles.groupMarkText}>{group.name[0]?.toUpperCase()}</Text></View>
                <View style={styles.groupCopy}><Text numberOfLines={1} style={styles.groupName}>{group.name}</Text><Text style={styles.groupRole}>{group.role}</Text></View>
                <Text style={styles.rowArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("../settings")}
            style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
          >
            <Text style={styles.settingsLabel}>Settings</Text>
            <Text style={styles.rowArrow}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 160 },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  identity: { alignItems: "center", flexDirection: "row", marginTop: spacing.xl },
  avatar: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.pill, height: 64, justifyContent: "center", width: 64 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 23 },
  identityCopy: { flex: 1, marginLeft: spacing.lg },
  name: { color: colors.ink, ...type.title },
  memberSince: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  section: { marginTop: spacing.xxxl },
  sectionLabel: { color: colors.muted, ...type.eyebrow, fontSize: 11 },
  activityPanel: { borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.md, paddingVertical: spacing.lg },
  activitySummary: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  weekCount: { color: colors.ink, fontFamily: fonts.bold, fontSize: 28, lineHeight: 32 },
  weekCountLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.9, marginTop: spacing.xs },
  todayStatus: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  todayStatusDone: { backgroundColor: colors.successSoft },
  todayStatusText: { color: colors.muted, ...type.label },
  todayStatusTextDone: { color: colors.success },
  weekMessage: { color: colors.muted, ...type.bodySmall, marginTop: spacing.md },
  activityRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", marginTop: spacing.lg, paddingTop: spacing.lg },
  activityMark: { backgroundColor: colors.brand, borderRadius: radii.pill, height: 9, width: 9 },
  activityCopy: { flex: 1, marginLeft: spacing.md },
  activityEyebrow: { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8, marginBottom: spacing.xs },
  activityTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  activityMeta: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs, textTransform: "capitalize" },
  groups: { marginTop: spacing.sm },
  groupRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 68 },
  groupMark: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, height: 42, justifyContent: "center", width: 42 },
  groupMarkText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 16 },
  groupCopy: { flex: 1, marginLeft: spacing.md },
  groupName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  groupRole: { color: colors.muted, ...type.label, marginTop: spacing.xs, textTransform: "capitalize" },
  settingsRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 56 },
  settingsLabel: { color: colors.ink, flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  rowArrow: { color: colors.brand, fontFamily: fonts.medium, fontSize: 24 },
  pressed: { opacity: 0.7 },
});
