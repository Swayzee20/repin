import type { HomeData } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { supabase } from "../../lib/supabase";
import { CommunityFeed, LoadingState, StateCard } from "../../ui/components";
import { useMainTabs } from "../../ui/main-tabs-context";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function CommunityTabScreen() {
  const router = useRouter();
  const { selectedGroupId, setSelectedGroupId } = useMainTabs();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [boardHeight, setBoardHeight] = useState(0);

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !auth.session) throw new Error("Sign in to view Community.");
      const search = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) });
      if (selectedGroupId) search.set("groupId", selectedGroupId);
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as HomeData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Community could not be loaded.");
      setData(body);
      setSelectedGroupId(body.selectedGroupId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Community could not be loaded.");
    } finally {
      setLoading(false);
    }
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

  if (loading && !data) return <SafeAreaView style={styles.safeArea}><LoadingState message="Loading Community…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safeArea}><View style={styles.state}><StateCard actionLabel="Try again" message={error} onAction={() => void loadCommunity()} title="Community unavailable" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.brand}>REPIN</Text>
        <Text style={styles.title}>Community</Text>

        {selectedGroup ? (
          <>
            <Pressable
              accessibilityLabel={`Selected group: ${selectedGroup.name}. Change group`}
              accessibilityRole="button"
              onPress={() => setPickerOpen((open) => !open)}
              style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
            >
              <View style={styles.selectorCopy}>
                <Text numberOfLines={1} style={styles.groupName}>{selectedGroup.name}</Text>
                <Text style={styles.groupRole}>{selectedGroup.role}</Text>
              </View>
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

            <View style={styles.groupActions}>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/groups/${selectedGroup.id}`)}><Text style={styles.actionText}>Manage group</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/groups/join")}><Text style={styles.actionText}>Join group</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/onboarding/create-group")}><Text style={styles.actionText}>Create group</Text></Pressable>
            </View>

            {loading ? <ActivityIndicator color={colors.brand} style={styles.refreshing} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View onLayout={handleBoardLayout} style={styles.boardArea}>
              {data?.communityWorkouts.length ? (
                boardHeight > 0 ? <CommunityFeed edgeToEdge mode="full" viewportHeight={boardHeight} workouts={data.communityWorkouts} /> : null
              ) : (
                <View style={styles.emptyBoardContent}><StateCard title="The board is quiet" message="Log a workout to get the conversation started." /></View>
              )}
            </View>
          </>
        ) : (
          <StateCard actionLabel="Join a group" message="Join or create a group to start training with your community." onAction={() => router.push("/groups/join")} title="Find your crew" />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  state: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  brand: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  selector: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", marginTop: spacing.xxl, minHeight: 64, paddingVertical: spacing.sm },
  selectorCopy: { flex: 1 },
  groupName: { color: colors.ink, ...type.title },
  groupRole: { color: colors.muted, ...type.label, marginTop: spacing.xs, textTransform: "capitalize" },
  chevron: { color: colors.brand, fontFamily: fonts.bold, fontSize: 16, marginLeft: spacing.md },
  groupDrawer: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.sm },
  groupOption: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", minHeight: 48, paddingHorizontal: spacing.md },
  selectedOption: { backgroundColor: colors.brandSoft },
  optionName: { color: colors.inkSoft, flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  check: { color: colors.brand, fontFamily: fonts.bold, fontSize: 17 },
  groupActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginBottom: spacing.lg, marginTop: spacing.md },
  boardArea: { backgroundColor: "#F7F2F2", flex: 1, marginHorizontal: -spacing.xxl, minHeight: 0 },
  emptyBoardContent: { padding: spacing.lg },
  actionText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  refreshing: { marginBottom: spacing.md },
  error: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
  pressed: { opacity: 0.72 },
});
