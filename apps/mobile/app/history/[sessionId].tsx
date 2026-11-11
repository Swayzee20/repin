import type { PersonalWorkoutDetail } from "@repin/types";
import { profileDashboardCopy } from "@repin/validation";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { deviceTimeZone, fetchOwnedWorkoutDetail } from "../../lib/profile-dashboard-api";
import { LoadingState, StateCard } from "../../ui/components";
import { TwoPane } from "../../ui/layout";
import { PersonalWorkoutDetailContent } from "../../ui/personal-workout-detail";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, spacing, type } from "../../ui/theme";
import { useStripState } from "../../ui/vertical-bar-edge";

export default function PersonalWorkoutScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const [workout, setWorkout] = useState<PersonalWorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timeZone = deviceTimeZone();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOwnedWorkoutDetail(sessionId).then((detail) => {
      if (!cancelled) setWorkout(detail);
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : profileDashboardCopy.workoutsErrorTitle);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  const body = loading && !workout
    ? <LoadingState message="Loading workout…" />
    : error && !workout
      ? (
        <StateCard
          actionLabel={profileDashboardCopy.tryAgain}
          message={profileDashboardCopy.errorBody}
          title={profileDashboardCopy.workoutsErrorTitle}
        />
      )
      : workout
        ? <PersonalWorkoutDetailContent timeZone={timeZone} workout={workout} />
        : <Text style={styles.muted}>Workout not found.</Text>;

  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            column="readable"
            contentPaddingBottom={spacing.xxl}
            fallback="hide-right"
            left={(
              <View style={styles.pane}>
                {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                <Text style={styles.title}>{profileDashboardCopy.workoutTitle}</Text>
                {body}
              </View>
            )}
            right={<View />}
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
  muted: { color: colors.muted, ...type.bodySmall },
});
