import type { BlockedUserSummary } from "@repin/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listBlockedUsers } from "../lib/moderation-api";
import { BlockSheet } from "../ui/block-sheet";
import { Button, Card, LoadingState, StateCard } from "../ui/components";
import { TwoPane, useLayoutMode } from "../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../ui/pushed-header";
import { colors, fonts, layout, radii, size, spacing, type } from "../ui/theme";
import { useStripState } from "../ui/vertical-bar-edge";

export default function BlockedAccountsScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const twoPane = mode === "twoPane";
  const [people, setPeople] = useState<BlockedUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BlockedUserSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeople(await listBlockedUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Blocked accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    if (!notice) return;
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(notice);
    const timer = setTimeout(() => setNotice(null), 4_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const countLabel = people.length === 1 ? "1 person" : `${people.length} people`;

  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            column="form"
            contentPaddingBottom={spacing.xxl}
            fallback="stack"
            left={(
              <View style={styles.pane}>
                {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                <Text style={styles.title}>Blocked accounts</Text>
                <Text style={styles.intro}>People you block can't see your posts or comments, and you won't see theirs. They aren't told.</Text>
              </View>
            )}
            right={(
              <View style={twoPane ? styles.listPane : styles.listStack}>
                {twoPane && !loading && !error && people.length > 0 ? <Text style={styles.count}>{countLabel}</Text> : null}
                {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
                {loading ? <LoadingState message="Loading blocked accounts…" /> : null}
                {!loading && error ? (
                  <StateCard actionLabel="Try again" message={error} onAction={() => void load()} title="Couldn't load blocked accounts" />
                ) : null}
                {!loading && !error && people.length === 0 ? (
                  <StateCard message="If you block someone, they'll show up here." title="No one blocked" />
                ) : null}
                {!loading && !error ? people.map((person) => (
                  <Card key={person.userId} style={styles.personCard}>
                    <View style={styles.identity}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{person.displayName.slice(0, 1).toUpperCase()}</Text></View>
                      <View style={styles.copy}>
                        <Text style={styles.name}>{person.displayName}</Text>
                        <Text style={styles.when}>{formatBlockedDate(person.blockedAt)}</Text>
                      </View>
                    </View>
                    <Button onPress={() => setPending(person)} style={styles.unblock} variant="secondary">{"Unblock"}</Button>
                  </Card>
                )) : null}
              </View>
            )}
          />
        </View>
      </SafeAreaView>
      <BlockSheet
        onBlocked={() => undefined}
        onDismiss={() => setPending(null)}
        onUnblocked={(displayName) => {
          setPeople((current) => current.filter((person) => person.userId !== pending?.userId));
          setNotice(`✓ ${displayName} unblocked`);
          setPending(null);
        }}
        request={pending ? { displayName: pending.displayName, mode: "unblock", userId: pending.userId } : null}
      />
    </>
  );
}

function formatBlockedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Blocked recently";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const formatted = new Intl.DateTimeFormat(undefined, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);
  return `Blocked ${formatted}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  title: { color: colors.ink, ...type.screenTitle, marginTop: spacing.lg },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  listPane: { gap: spacing.md, maxWidth: layout.formMax, width: "100%" },
  listStack: { gap: spacing.md, marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  count: { color: colors.ink, ...type.section },
  notice: { color: colors.success, ...type.body },
  personCard: { gap: spacing.md },
  identity: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.md,
    justifyContent: "center",
    width: size.avatars.md,
  },
  avatarText: { ...type.body, color: colors.brand, fontFamily: fonts.semibold },
  copy: { flex: 1, gap: spacing.xs },
  name: { ...type.body, color: colors.ink, fontFamily: fonts.semibold },
  when: { color: colors.muted, ...type.bodySmall },
  unblock: { height: size.hit, minHeight: size.hit },
});
