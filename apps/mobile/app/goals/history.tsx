import type { GoalSummary } from "@repin/types";
import { goalCopy } from "@repin/validation";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listGoals } from "../../lib/goals-api";
import { isLayoutPreview } from "../../lib/layout-preview";
import { LoadingState, StateCard } from "../../ui/components";
import { GoalProgressCard } from "../../ui/goals";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, spacing, type } from "../../ui/theme";
import { useStripState } from "../../ui/vertical-bar-edge";

export default function GoalHistoryScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const twoPane = mode === "twoPane";
  const [history, setHistory] = useState<GoalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (__DEV__ && isLayoutPreview()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listGoals();
      setHistory(list.history);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : goalCopy.errorBody);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const list = (
    <View style={styles.stack}>
      {loading && !history.length ? <LoadingState message="Loading history…" /> : null}
      {error && !history.length ? (
        <StateCard actionLabel={goalCopy.errorAction} message={error} onAction={() => void load()} title={goalCopy.errorTitle} />
      ) : null}
      {!loading && !error && !history.length ? (
        <Text style={styles.muted}>No finished goals yet.</Text>
      ) : null}
      {history.map((goal) => (
        <GoalProgressCard key={goal.id} goal={goal} onPress={() => router.push(`/goals/${goal.id}`)} />
      ))}
    </View>
  );

  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            column="readable"
            contentPaddingBottom={spacing.xxl}
            fallback="stack"
            left={(
              <View style={styles.pane}>
                {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                <Text style={styles.title}>{goalCopy.history}</Text>
                {twoPane ? null : list}
              </View>
            )}
            right={twoPane ? <View style={styles.pane}>{list}</View> : <View />}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, gap: spacing.lg },
  title: { color: colors.ink, ...type.screenTitle },
  stack: { gap: spacing.md },
  muted: { color: colors.muted, ...type.bodySmall },
});
