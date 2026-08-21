import type { GroupSummary, WorkoutFeedItem } from "@repin/types";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { fetchGroupBoard } from "../../lib/group-board";
import { BackButton, Button, Card, CommunityFeed, LoadingState, Screen, SectionHeader, StateCard } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const configuredPublicWebUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? "").trim().replace(/\/$/, "");
const publicWebUrl = configuredPublicWebUrl.startsWith("https://")
  ? configuredPublicWebUrl
  : "https://repin.vercel.app";

export default function GroupDetailScreen() {
  const router = useRouter();
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
        message: `Join my RepIn group ‘${groupName}’. Invite code: ${inviteCode}\n${inviteUrl}`,
      });
    } catch {
      setInviteActionError("Invite could not be shared.");
    }
  }, []);

  return (
    <Screen preserveTransformedContent>
      <BackButton label="Home" onPress={() => router.back()} />
      {loading ? <LoadingState message="Loading group…" /> : error ? (
        <StateCard actionLabel="Try again" message={error} onAction={() => void loadGroup()} title="Unable to open group" />
      ) : group ? (
        <>
          <View style={styles.hero}>
            <View style={styles.groupMark}><Text style={styles.groupMarkText}>{group.name[0]?.toUpperCase()}</Text></View>
            <View style={styles.heroCopy}><Text style={styles.eyebrow}>GROUP</Text><Text style={styles.title}>{group.name}</Text></View>
            <View style={styles.rolePill}><Text style={styles.roleText}>{group.role}</Text></View>
          </View>

          {group.inviteCode ? (
            <Card style={styles.inviteCard}>
              <View style={styles.inviteTopRow}>
                <View style={styles.inviteCopy}>
                  <Text style={styles.inviteLabel}>INVITE YOUR CREW</Text>
                  <Text accessibilityLabel={`Invite code ${group.inviteCode}`} selectable style={styles.inviteCode}>{group.inviteCode}</Text>
                </View>
                <View style={styles.inviteActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void copyInviteCode(group.inviteCode!)}
                    style={({ pressed }) => [styles.copyAction, pressed && styles.actionPressed]}
                  >
                    <Text accessibilityLiveRegion="polite" style={styles.copyActionText}>{copied ? "Copied" : "Copy Code"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void shareInvite(group.name, group.inviteCode!)}
                    style={({ pressed }) => [styles.shareAction, pressed && styles.actionPressed]}
                  >
                    <Text style={styles.shareActionText}>Share</Text>
                  </Pressable>
                </View>
              </View>
              {inviteActionError ? <Text accessibilityLiveRegion="polite" style={styles.inviteError}>{inviteActionError}</Text> : null}
            </Card>
          ) : null}

          <View style={styles.board}>
            <SectionHeader eyebrow="COMMUNITY BOARD" title="Recent workouts" action={
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`./${group.id}/log-workout`)}><Text style={styles.logLink}>+ Log workout</Text></Pressable>
            } />
            {workouts.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Be the first to check in</Text>
                <Text style={styles.emptyCopy}>Log a workout to start this group’s Community Board.</Text>
                <Button onPress={() => router.push(`./${group.id}/log-workout`)} style={styles.emptyAction}>Log a Workout</Button>
              </Card>
            ) : <CommunityFeed workouts={workouts} />}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", flexDirection: "row" },
  groupMark: { alignItems: "center", backgroundColor: colors.brand, borderRadius: radii.lg, height: 52, justifyContent: "center", width: 52 },
  groupMarkText: { color: colors.surface, fontFamily: fonts.bold, fontSize: 22 },
  heroCopy: { flex: 1, marginHorizontal: spacing.md }, eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.title, marginTop: spacing.xs },
  rolePill: { backgroundColor: colors.brandSoft, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  roleText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 11, textTransform: "capitalize" },
  inviteCard: { backgroundColor: colors.brandSoft, borderColor: colors.boardBorder, marginTop: spacing.xl, padding: spacing.md }, inviteTopRow: { alignItems: "center", flexDirection: "row" }, inviteCopy: { flex: 1 },
  inviteLabel: { color: colors.brandPressed, ...type.eyebrow }, inviteCode: { color: colors.ink, fontFamily: fonts.bold, fontSize: 19, letterSpacing: 2, marginTop: spacing.xs },
  inviteActions: { flexDirection: "row", gap: spacing.sm, marginLeft: spacing.md }, copyAction: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.boardBorder, borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.sm },
  copyActionText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 }, shareAction: { alignItems: "center", backgroundColor: colors.brand, borderRadius: radii.sm, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.sm }, shareActionText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 13 }, actionPressed: { opacity: 0.72 }, inviteError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
  board: { backgroundColor: colors.board, borderColor: colors.boardBorder, borderRadius: radii.xl, borderWidth: 1, marginTop: spacing.xxxl, overflow: "visible", padding: spacing.lg },
  logLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  emptyCard: { alignItems: "center", padding: spacing.xxl }, emptyTitle: { color: colors.ink, ...type.heading }, emptyCopy: { color: colors.muted, ...type.bodySmall, marginTop: spacing.sm, textAlign: "center" }, emptyAction: { alignSelf: "stretch", marginTop: spacing.lg },
});
