import type { HomeData } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { LoadingState, StateCard } from "../../ui/components";
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

  const initials = useMemo(() => data?.user.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "R", [data]);

  if (loading && !data) return <SafeAreaView style={styles.safeArea}><LoadingState message="Loading profile…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safeArea}><View style={styles.state}><StateCard actionLabel="Try again" message={error} onAction={() => void loadProfile()} title="Profile unavailable" /></View></SafeAreaView>;
  if (!data) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>REPIN</Text>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" hitSlop={10} onPress={() => router.push("../settings")}><Text style={styles.settings}>⚙</Text></Pressable>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <Text style={styles.name}>{data.user.displayName}</Text>
          <Text style={styles.memberSince}>Training with RepIn since {new Date(data.user.createdAt).getFullYear()}</Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{data.snapshot.workoutsThisWeek}</Text><Text style={styles.statLabel}>THIS WEEK</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{data.groups.length}</Text><Text style={styles.statLabel}>GROUPS</Text></View>
        </View>

        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.weekRow}>
          <View style={[styles.weekStatus, data.snapshot.hasWorkoutToday && styles.weekStatusDone]}><Text style={[styles.weekGlyph, data.snapshot.hasWorkoutToday && styles.weekGlyphDone]}>{data.snapshot.hasWorkoutToday ? "✓" : "+"}</Text></View>
          <View style={styles.weekCopy}><Text style={styles.weekTitle}>{data.snapshot.hasWorkoutToday ? "Workout logged today" : "Today is open"}</Text><Text style={styles.weekMessage}>{data.snapshot.message}</Text></View>
        </View>

        {data.snapshot.mostRecentWorkoutToday ? (
          <>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.activityRow}>
              <View style={styles.activityMark} />
              <View style={styles.activityCopy}><Text style={styles.activityTitle}>{data.snapshot.mostRecentWorkoutToday.title}</Text><Text style={styles.activityMeta}>{data.snapshot.mostRecentWorkoutToday.workoutType}{data.snapshot.mostRecentWorkoutToday.durationMinutes ? ` · ${data.snapshot.mostRecentWorkoutToday.durationMinutes} min` : ""}</Text></View>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>My Groups</Text>
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
              <Text style={styles.groupArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 160 },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  brand: { color: colors.brand, ...type.eyebrow },
  settings: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 23 },
  identity: { alignItems: "center", marginTop: spacing.xxl },
  avatar: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.pill, height: 82, justifyContent: "center", width: 82 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 27 },
  name: { color: colors.ink, ...type.title, marginTop: spacing.md },
  memberSince: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  stats: { borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", marginTop: spacing.xxl, paddingVertical: spacing.lg },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 24 },
  statLabel: { color: colors.muted, ...type.eyebrow, fontSize: 10, marginTop: spacing.xs },
  statDivider: { backgroundColor: colors.border, width: 1 },
  sectionTitle: { color: colors.ink, ...type.heading, marginTop: spacing.xxxl },
  weekRow: { alignItems: "center", flexDirection: "row", marginTop: spacing.md },
  weekStatus: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, height: 46, justifyContent: "center", width: 46 },
  weekStatusDone: { backgroundColor: colors.successSoft },
  weekGlyph: { color: colors.muted, fontFamily: fonts.bold, fontSize: 19 },
  weekGlyphDone: { color: colors.success },
  weekCopy: { flex: 1, marginLeft: spacing.md },
  weekTitle: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15 },
  weekMessage: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  activityRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", marginTop: spacing.md, paddingBottom: spacing.lg },
  activityMark: { backgroundColor: colors.brand, borderRadius: radii.pill, height: 9, width: 9 },
  activityCopy: { flex: 1, marginLeft: spacing.md },
  activityTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  activityMeta: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs, textTransform: "capitalize" },
  groups: { marginTop: spacing.sm },
  groupRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 68 },
  groupMark: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, height: 42, justifyContent: "center", width: 42 },
  groupMarkText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 16 },
  groupCopy: { flex: 1, marginLeft: spacing.md },
  groupName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  groupRole: { color: colors.muted, ...type.label, marginTop: spacing.xs, textTransform: "capitalize" },
  groupArrow: { color: colors.brand, fontFamily: fonts.medium, fontSize: 24 },
  pressed: { opacity: 0.7 },
});
