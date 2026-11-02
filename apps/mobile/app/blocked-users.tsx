import type { BlockedUserSummary } from "@repin/types";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listBlockedUsers, unblockUser } from "../lib/moderation-api";
import { Button, Card, LoadingState, StateCard } from "../ui/components";
import { TwoPane, useLayoutMode } from "../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../ui/primitives";
import { colors, layout, spacing, type } from "../ui/theme";

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlockedUsers(await listBlockedUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Blocked users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const unblock = async (userId: string) => {
    setPendingId(userId);
    setError(null);
    try {
      await unblockUser(userId);
      setBlockedUsers((current) => current.filter((person) => person.userId !== userId));
    } catch (unblockError) {
      setError(unblockError instanceof Error ? unblockError.message : "Person could not be unblocked.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        column="form"
        contentPaddingBottom={spacing.xxl}
        fallback="stack"
        left={(
          <View style={styles.pane}>
            <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
            <Text style={styles.title}>Blocked users</Text>
            <Text style={styles.intro}>People you block stay in your groups. Their posts, comments, and reactions stay hidden from you until you unblock them.</Text>
          </View>
        )}
        right={(
          <View style={twoPane ? styles.listPane : styles.listStack}>
            {loading ? <LoadingState message="Loading blocked users…" /> : null}
            {!loading && error ? (
              <StateCard actionLabel="Try again" message={error} onAction={() => void load()} title="Couldn't load blocked users" />
            ) : null}
            {!loading && !error && blockedUsers.length === 0 ? (
              <StateCard message="You haven't blocked anyone." title="No blocked users" />
            ) : null}
            {!loading && !error ? blockedUsers.map((person) => (
              <Card key={person.userId} style={styles.personCard}>
                <Text style={styles.name}>{person.displayName}</Text>
                <Button
                  loading={pendingId === person.userId}
                  loadingLabel="Unblocking"
                  onPress={() => void unblock(person.userId)}
                  variant="secondary"
                >
                  Unblock
                </Button>
              </Card>
            )) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  title: { color: colors.ink, ...type.screenTitle, marginTop: spacing.lg },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  listPane: { gap: spacing.md, maxWidth: layout.formMax, width: "100%" },
  listStack: { gap: spacing.md, marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  personCard: { gap: spacing.md },
  name: { color: colors.ink, ...type.section },
});
