import type { GroupSummary, WorkoutFeedItem } from "@repin/types";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { fetchGroupBoard } from "../../lib/group-board";
import { Button, Card, CommunityFeed, LoadingState, SectionHeader, StateCard } from "../../ui/components";
import { Icon } from "../../ui/icons";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import { colors, radii, size, spacing, type } from "../../ui/theme";

const configuredPublicWebUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? "").trim().replace(/\/$/, "");
const publicWebUrl = configuredPublicWebUrl.startsWith("https://")
  ? configuredPublicWebUrl
  : "https://repin.vercel.app";

export default function GroupDetailScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
  }, []);

  const loadGroup = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!groupId) throw new Error("This group link is invalid.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to view this group.");
      const board = await fetchGroupBoard({
        accessToken: data.session.access_token,
        groupId,
      });
      setGroup(board.group); setWorkouts(board.workouts);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Group could not be loaded."); }
    finally { setLoading(false); }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void loadGroup(); }, [loadGroup]));

  const copyInviteCode = useCallback(async (inviteCode: string) => {
    setInviteActionError(null);
    try {
      await Clipboard.setStringAsync(inviteCode);
      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setInviteActionError("Invite code could not be copied.");
    }
  }, []);

  const shareInvite = useCallback(async (groupName: string, inviteCode: string) => {
    setInviteActionError(null);
    try {
      const inviteUrl = `${publicWebUrl}/join/${encodeURIComponent(inviteCode)}`;
      await Share.share({
        message: `Join my repin group ‘${groupName}’. Invite code: ${inviteCode}\n${inviteUrl}`,
      });
    } catch {
      setInviteActionError("Invite could not be shared.");
    }
  }, []);

  const openLog = useCallback(() => {
    if (!group) return;
    router.push(`./${group.id}/log-workout`);
  }, [group, router]);

  const feedFillsPane = Boolean(group && workouts.length > 0 && twoPane);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        column="readable"
        contentPaddingBottom={spacing.xxl}
        fallback="stack"
        left={(
          <View style={styles.pane}>
            <RoundIconButton accessibilityLabel="Home" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
            {loading && !group ? <LoadingState message="Loading group…" /> : error && !group ? (
              <StateCard actionLabel="Try again" message={error} onAction={() => void loadGroup()} title="Unable to open group" />
            ) : group ? (
              <>
                {error ? <Text style={styles.refreshError}>Group refresh failed. Showing saved content.</Text> : null}
                <View style={styles.hero}>
                  <View style={styles.groupMark}><Text style={styles.groupMarkText}>{group.name[0]?.toUpperCase()}</Text></View>
                  <View style={styles.heroCopy}>
                    <Text style={styles.eyebrow}>GROUP</Text>
                    <Text style={styles.title}>{group.name}</Text>
                  </View>
                  <View style={styles.roleChip}><Text style={styles.roleText}>{group.role}</Text></View>
                </View>
                {group.inviteCode ? (
                  <Card style={styles.inviteCard}>
                    <Text style={styles.inviteLabel}>INVITE YOUR CREW</Text>
                    <Text accessibilityLabel={`Invite code ${group.inviteCode}`} selectable style={styles.inviteCode}>{group.inviteCode}</Text>
                    <View style={styles.inviteActions}>
                      <View style={styles.inviteAction}>
                        <Button onPress={() => void copyInviteCode(group.inviteCode!)} variant="secondary">
                          Copy code
                        </Button>
                      </View>
                      <View style={styles.inviteAction}>
                        <Button onPress={() => void shareInvite(group.name, group.inviteCode!)}>Share</Button>
                      </View>
                    </View>
                    {inviteActionError ? (
                      <Text accessibilityLiveRegion="polite" style={styles.inviteError}>{inviteActionError}</Text>
                    ) : copied ? (
                      <Text accessibilityLiveRegion="polite" style={styles.copied}>Copied</Text>
                    ) : null}
                  </Card>
                ) : null}
              </>
            ) : null}
          </View>
        )}
        right={group ? (
          <GroupBoard feedFillsPane={feedFillsPane} onLog={openLog} stacked={!twoPane} workouts={workouts} />
        ) : (
          <View />
        )}
        scrollableRight={!feedFillsPane}
      />
    </SafeAreaView>
  );
}

function GroupBoard({
  feedFillsPane,
  onLog,
  stacked,
  workouts,
}: {
  feedFillsPane: boolean;
  onLog: () => void;
  stacked: boolean;
  workouts: WorkoutFeedItem[];
}) {
  const [feedHeight, setFeedHeight] = useState(0);
  return (
    <View style={[styles.board, feedFillsPane ? styles.boardSplit : styles.boardStack, stacked && styles.boardStacked]}>
      <SectionHeader
        action={(
          <Pressable accessibilityRole="button" onPress={onLog} style={styles.logLink}>
            <Icon color={colors.brand} name="plus" size={size.icon.sm} />
            <Text style={styles.logLinkText}>Log workout</Text>
          </Pressable>
        )}
        eyebrow="COMMUNITY BOARD"
        title="Recent workouts"
      />
      {workouts.length === 0 ? (
        <StateCard
          actionLabel="Log a Workout"
          message="Log a workout to start this group’s Community Board."
          onAction={onLog}
          title="Be the first to rep in"
        />
      ) : (
        <View
          onLayout={(event) => {
            if (!feedFillsPane) return;
            const next = Math.round(event.nativeEvent.layout.height);
            setFeedHeight((current) => (current === next ? current : next));
          }}
          style={feedFillsPane ? styles.feedSlot : undefined}
        >
          <CommunityFeed viewportHeight={feedFillsPane && feedHeight > 0 ? feedHeight : undefined} workouts={workouts} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  pane: { flexGrow: 1 },
  refreshError: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
  hero: { alignItems: "center", flexDirection: "row" },
  groupMark: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    height: size.primary,
    justifyContent: "center",
    width: size.primary,
  },
  groupMarkText: { color: colors.surface, ...type.title },
  heroCopy: { flex: 1, marginHorizontal: spacing.md },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.title, marginTop: spacing.xs },
  roleChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  roleText: { color: colors.brand, ...type.micro, textTransform: "capitalize" },
  inviteCard: { gap: spacing.md, marginTop: spacing.xl },
  inviteLabel: { color: colors.brandPressed, ...type.eyebrow },
  inviteCode: { color: colors.ink, ...type.cardTitle, letterSpacing: 2 },
  inviteActions: { flexDirection: "row", gap: spacing.sm },
  inviteAction: { flex: 1 },
  copied: { color: colors.success, ...type.bodySmall },
  inviteError: { color: colors.danger, ...type.bodySmall },
  board: { backgroundColor: colors.surfaceMuted, borderColor: colors.boardBorder, borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg },
  boardStack: { overflow: "visible" },
  boardStacked: { marginTop: spacing.xxl },
  boardSplit: { borderRadius: radii.lg, flex: 1, overflow: "visible" },
  feedSlot: { flex: 1, minHeight: 0 },
  logLink: { alignItems: "center", flexDirection: "row", gap: spacing.xs, minHeight: size.hit },
  logLinkText: { color: colors.brand, ...type.label },
});
