import { getUserInitials, resolveUserDisplayName, type ProfileData } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import {
  getWorkoutDataRevision,
  isFresh,
  type FreshnessRecord,
} from "../../../lib/data-freshness";
import { BrandHeader, Card, LoadingState, StateCard } from "../../../ui/components";
import { Icon } from "../../../ui/icons";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { useMainTabs } from "../../../ui/main-tabs-context";
import { ListRow } from "../../../ui/primitives";
import { colors, fonts, radii, size, spacing, type } from "../../../ui/theme";
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
  const dataRef = useRef<ProfileData | null>(null);
  const lastSuccessfulLoad = useRef<FreshnessRecord | null>(null);
  const inFlightRequests = useRef(new Map<string, Promise<void>>());
  const latestRequestKey = useRef<string | null>(null);
  const loadedUserId = useRef<string | null>(null);

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
      dataRef.current = null;
      lastSuccessfulLoad.current = null;
      setData(null);
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
      const search = new URLSearchParams({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()), view: "profile" });
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
      } catch (loadError) {
        if (latestRequestKey.current === requestKey) {
          setError(loadError instanceof Error ? loadError.message : "Profile could not be loaded.");
        }
      } finally {
        if (latestRequestKey.current === requestKey) setLoading(false);
      }
    })().finally(() => inFlightRequests.current.delete(requestKey));
    inFlightRequests.current.set(requestKey, request);
    return request;
  }, [selectedGroupId, setSelectedGroupId]);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  const displayName = useMemo(() => resolveUserDisplayName({ displayName: data?.user.displayName }), [data]);
  const initials = useMemo(() => getUserInitials({ displayName: data?.user.displayName }), [data]);
  const contentPaddingBottom = stripPresent ? insets.bottom + spacing.xxl : insets.bottom + size.primary + spacing.xxl;

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
                <StateCard actionLabel="Try again" message={error} onAction={() => void loadProfile()} title="Profile unavailable" />
              </View>
            )}
            right={<View />}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (!data) return null;

  const reppedIn = data.snapshot.hasWorkoutToday;
  const latest = data.snapshot.mostRecentWorkoutToday;

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <TwoPane
          column="readable"
          contentPaddingBottom={contentPaddingBottom}
          fallback="stack"
          left={(
            <View style={styles.identityPane}>
              <BrandHeader />
              <Card>
                <View style={styles.identity}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                  <View style={styles.identityCopy}>
                    <Text style={styles.name}>{displayName}</Text>
                    <Text style={styles.memberSince}>repin member since {new Date(data.user.createdAt).getFullYear()}</Text>
                  </View>
                </View>
              </Card>
              <Card style={styles.weekCard}>
                <Text style={styles.weekHeading}>This week</Text>
                <View style={styles.weekSummary}>
                  <View>
                    <Text style={styles.weekCount}>{data.snapshot.workoutsThisWeek}</Text>
                    <Text style={styles.weekUnit}>{data.snapshot.workoutsThisWeek === 1 ? "workout" : "workouts"}</Text>
                  </View>
                  <View style={[styles.todayStatus, reppedIn && styles.todayStatusDone]}>
                    {reppedIn ? <Icon color={colors.success} name="checkmark" size={size.icon.sm} /> : null}
                    <Text style={[styles.todayStatusText, reppedIn && styles.todayStatusTextDone]}>
                      {reppedIn ? "Repped in today" : "Today is open"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.weekMessage}>{data.snapshot.message}</Text>
                {latest ? (
                  <View style={styles.activityRow}>
                    <View style={styles.activityMark} />
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityEyebrow}>Latest today</Text>
                      <Text style={styles.activityTitle}>{latest.title}</Text>
                      <Text style={styles.activityMeta}>
                        {latest.workoutType}{latest.durationMinutes ? ` · ${latest.durationMinutes} min` : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </Card>
            </View>
          )}
          right={(
            <View style={[styles.lists, !twoPane && styles.listsStacked]}>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Groups</Text>
                {data.groups.length === 0 ? (
                  <Card><Text style={styles.emptyCopy}>You’re not in a group yet.</Text></Card>
                ) : (
                  <Card style={styles.listCard}>
                    {data.groups.map((group, index) => (
                      <View key={group.id} style={index > 0 ? styles.rowRule : undefined}>
                        <ListRow
                          label={group.name}
                          leading={<GroupMark name={group.name} />}
                          onPress={() => {
                            setSelectedGroupId(group.id);
                            router.push(`/groups/${group.id}`);
                          }}
                          value={roleLabel(group.role)}
                        />
                      </View>
                    ))}
                  </Card>
                )}
              </View>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Account</Text>
                <Card style={styles.listCard}>
                  <ListRow label="Settings" onPress={() => router.push("/settings")} />
                </Card>
              </View>
            </View>
          )}
        />
      </SafeAreaView>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadProfile()}
          style={[styles.refreshError, { right: insets.right + spacing.xxl, top: insets.top + spacing.xxl }]}
        >
          <Text style={styles.refreshErrorText}>Refresh failed · Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GroupMark({ name }: { name: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.groupMark}>
      <Text style={styles.groupMarkText}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}

function roleLabel(role: string) {
  return role ? role.slice(0, 1).toUpperCase() + role.slice(1) : role;
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
  memberSince: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  weekCard: { gap: spacing.md },
  weekHeading: { color: colors.ink, ...type.section },
  weekSummary: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "space-between" },
  weekCount: { color: colors.ink, ...type.display },
  weekUnit: { color: colors.muted, ...type.bodySmall },
  todayStatus: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  todayStatusDone: { backgroundColor: colors.successSoft },
  todayStatusText: { color: colors.muted, ...type.label },
  todayStatusTextDone: { color: colors.success },
  weekMessage: { color: colors.muted, ...type.bodySmall },
  activityRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", paddingTop: spacing.lg },
  activityMark: { backgroundColor: colors.brand, borderRadius: radii.pill, height: spacing.sm, width: spacing.sm },
  activityCopy: { flex: 1, marginLeft: spacing.md },
  activityEyebrow: { color: colors.muted, ...type.micro, marginBottom: spacing.xs },
  activityTitle: { color: colors.ink, ...type.body, fontFamily: fonts.semibold },
  activityMeta: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs, textTransform: "capitalize" },
  lists: { flexGrow: 1, gap: spacing.xxl },
  listsStacked: { marginTop: spacing.xxl },
  block: { gap: spacing.sm },
  blockTitle: { color: colors.ink, ...type.section },
  listCard: { overflow: "hidden", padding: 0 },
  rowRule: { borderTopColor: colors.border, borderTopWidth: 1 },
  emptyCopy: { color: colors.muted, ...type.bodySmall },
  groupMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: size.avatars.md,
    justifyContent: "center",
    width: size.avatars.md,
  },
  groupMarkText: { color: colors.brand, ...type.body, fontFamily: fonts.bold },
  refreshError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: size.hit,
    paddingHorizontal: spacing.md,
    position: "absolute",
  },
  refreshErrorText: { color: colors.danger, ...type.label },
});
