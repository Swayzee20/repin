import type { CurrentBest, PersonalWorkoutDetail } from "@repin/types";
import { profileDashboardCopy } from "@repin/validation";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deviceTimeZone,
  fetchOwnedPersonalRecords,
  fetchOwnedWorkoutDetail,
} from "../../lib/profile-dashboard-api";
import { LoadingState, StateCard } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { useMainTabs } from "../../ui/main-tabs-context";
import { PersonalWorkoutDetailContent } from "../../ui/personal-workout-detail";
import { CurrentBestRow, groupedBests } from "../../ui/profile-dashboard";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, spacing, type } from "../../ui/theme";
import { useStripPresent, useStripState } from "../../ui/vertical-bar-edge";

export default function CurrentBestsScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const strip = useStripState();
  const stripPresent = useStripPresent();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const { selectedGroupId, toggleWorkoutChooser } = useMainTabs();
  const [bests, setBests] = useState<CurrentBest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonalWorkoutDetail | null>(null);
  const [missingSource, setMissingSource] = useState(false);
  const timeZone = deviceTimeZone();
  const showPlus = Boolean(selectedGroupId) && !stripPresent;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchOwnedPersonalRecords();
      setBests(page.bests);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : profileDashboardCopy.bestsErrorTitle);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openBest = useCallback((best: CurrentBest) => {
    if (!best.sourceAvailable || !best.sourceSessionId) {
      if (twoPane) {
        setSelectedId(best.id);
        setDetail(null);
        setMissingSource(true);
      }
      return;
    }
    if (twoPane) {
      setSelectedId(best.id);
      setMissingSource(false);
      void fetchOwnedWorkoutDetail(best.sourceSessionId).then(setDetail).catch(() => {
        setDetail(null);
        setMissingSource(true);
      });
      return;
    }
    router.push(`/history/${best.sourceSessionId}`);
  }, [router, twoPane]);

  const groups = groupedBests(bests ?? []);
  const list = (
    <View style={styles.stack}>
      <Text style={styles.helper}>{profileDashboardCopy.currentBestsHelper}</Text>
      {loading && !bests ? <LoadingState message="Loading current bests…" /> : null}
      {error && !bests ? (
        <StateCard
          actionLabel={profileDashboardCopy.tryAgain}
          message={profileDashboardCopy.errorBody}
          onAction={() => void load()}
          title={profileDashboardCopy.bestsErrorTitle}
        />
      ) : null}
      {!loading && !error && !bests?.length ? (
        <StateCard
          message={profileDashboardCopy.bestsEmptyBody}
          title={profileDashboardCopy.bestsEmptyTitle}
        />
      ) : null}
      {groups.map((group) => (
        <View key={group.kind} style={styles.group}>
          <Text style={styles.groupTitle}>{group.label}</Text>
          {group.items.map((best) => (
            <CurrentBestRow
              best={best}
              key={best.id}
              onPress={() => openBest(best)}
              selected={twoPane && best.id === selectedId}
            />
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <>
      {nativeHeader ? (
        <Stack.Screen
          options={{
            ...pushedHeaderScreenOptions(),
            headerRight: showPlus
              ? () => <RoundIconButton accessibilityLabel="Log a workout" kind="plus" onPress={toggleWorkoutChooser} />
              : undefined,
          }}
        />
      ) : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            contentPaddingBottom={spacing.xxl}
            fallback="hide-right"
            left={(
              <View style={styles.pane}>
                <View style={styles.headerRow}>
                  {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                  <Text style={styles.title}>{profileDashboardCopy.bestsTitle}</Text>
                  {showPlus && !nativeHeader ? (
                    <RoundIconButton accessibilityLabel="Log a workout" kind="plus" onPress={toggleWorkoutChooser} />
                  ) : null}
                </View>
                {list}
              </View>
            )}
            right={twoPane ? (
              <View style={styles.pane}>
                {missingSource ? (
                  <StateCard
                    message={profileDashboardCopy.missingSource}
                    title={profileDashboardCopy.bestsTitle}
                  />
                ) : detail ? (
                  <PersonalWorkoutDetailContent timeZone={timeZone} workout={detail} />
                ) : (
                  <Text style={styles.helper}>Select a current best.</Text>
                )}
              </View>
            ) : <View />}
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
  headerRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  title: { color: colors.ink, flex: 1, ...type.screenTitle },
  helper: { color: colors.muted, ...type.bodySmall },
  stack: { gap: spacing.xl },
  group: { gap: spacing.md },
  groupTitle: { color: colors.brandPressed, ...type.eyebrow },
});
