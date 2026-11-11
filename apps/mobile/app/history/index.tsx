import type { PersonalWorkoutDetail, PersonalWorkoutListItem } from "@repin/types";
import { formatPerformedDateGroup, profileDashboardCopy } from "@repin/validation";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deviceTimeZone,
  fetchOwnedWorkoutDetail,
  fetchOwnedWorkouts,
} from "../../lib/profile-dashboard-api";
import { LoadingState, StateCard } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { useMainTabs } from "../../ui/main-tabs-context";
import { PersonalWorkoutDetailContent } from "../../ui/personal-workout-detail";
import { WorkoutHistoryRow } from "../../ui/profile-dashboard";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, size, spacing, type } from "../../ui/theme";
import { useStripPresent, useStripState } from "../../ui/vertical-bar-edge";
import { WorkoutFilterSheet, filterLabel, type WorkoutFilterValue } from "../../ui/workout-filter-sheet";
import { pressableFocused, webFocusRing } from "../../ui/focus-ring";

const emptyFilter: WorkoutFilterValue = { sport: null, from: null, to: null };

export default function WorkoutHistoryScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const strip = useStripState();
  const stripPresent = useStripPresent();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const { selectedGroupId, toggleWorkoutChooser } = useMainTabs();
  const [workouts, setWorkouts] = useState<PersonalWorkoutListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkoutFilterValue>(emptyFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonalWorkoutDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const timeZone = deviceTimeZone();

  const load = useCallback(async (next: WorkoutFilterValue, cursor?: string) => {
    if (!cursor) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const page = await fetchOwnedWorkouts({
        cursor,
        sport: next.sport,
        from: next.from,
        to: next.to,
      });
      setWorkouts((current) => cursor ? dedupeWorkouts([...current, ...page.workouts]) : page.workouts);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : profileDashboardCopy.workoutsErrorTitle);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(filter); }, [filter, load]));

  useFocusEffect(useCallback(() => {
    if (!twoPane || selectedId || !workouts[0]) return;
    setSelectedId(workouts[0].id);
  }, [selectedId, twoPane, workouts]));

  const openWorkout = useCallback((id: string) => {
    if (twoPane) {
      setSelectedId(id);
      return;
    }
    router.push(`/history/${id}`);
  }, [router, twoPane]);

  useFocusEffect(useCallback(() => {
    if (!twoPane || !selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailError(null);
    void fetchOwnedWorkoutDetail(selectedId).then((workout) => {
      if (!cancelled) setDetail(workout);
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setDetailError(loadError instanceof Error ? loadError.message : profileDashboardCopy.workoutsErrorTitle);
      }
    });
    return () => { cancelled = true; };
  }, [selectedId, twoPane]));

  const grouped = useMemo(() => groupByDate(workouts, timeZone), [timeZone, workouts]);
  const showPlus = Boolean(selectedGroupId) && !stripPresent;
  const filteredEmpty = !loading && !workouts.length && (filter.sport || filter.from);

  const filterControl = (
    <Pressable
      accessibilityLabel={`${profileDashboardCopy.filter}, ${filterLabel(filter)}`}
      accessibilityRole="button"
      onPress={() => setFilterOpen(true)}
      style={(state) => [styles.filter, webFocusRing(pressableFocused(state))]}
    >
      <Text style={styles.filterText}>{filterLabel(filter)}</Text>
    </Pressable>
  );

  const emptyState = loading && !workouts.length ? <LoadingState message="Loading workouts…" />
    : error && !workouts.length ? (
      <StateCard
        actionLabel={profileDashboardCopy.tryAgain}
        message={profileDashboardCopy.errorBody}
        onAction={() => void load(filter)}
        title={profileDashboardCopy.workoutsErrorTitle}
      />
    ) : filteredEmpty ? (
      <StateCard
        message={profileDashboardCopy.filterEmptyBody}
        title={profileDashboardCopy.filterEmptyTitle}
      />
    ) : !loading && !error && !workouts.length ? (
      <StateCard
        message={profileDashboardCopy.recentEmptyBody}
        title={profileDashboardCopy.recentEmptyTitle}
      />
    ) : null;

  const list = (
    <FlatList
      ListHeaderComponent={(
        <View style={styles.listHeader}>
          {filterControl}
          {emptyState}
        </View>
      )}
      ListFooterComponent={
        !loading && workouts.length && !nextCursor
          ? <Text style={styles.end}>{profileDashboardCopy.endOfHistory}</Text>
          : undefined
      }
      contentContainerStyle={styles.list}
      data={grouped}
      keyExtractor={(item) => item.id}
      onEndReached={() => {
        if (nextCursor && !loadingMore) void load(filter, nextCursor);
      }}
      renderItem={({ item }) => item.kind === "header" ? (
        <Text style={styles.dateHeader}>{item.label}</Text>
      ) : (
        <WorkoutHistoryRow
          onPress={() => openWorkout(item.workout.id)}
          selected={twoPane && item.workout.id === selectedId}
          timeZone={timeZone}
          workout={item.workout}
        />
      )}
      style={styles.flex}
    />
  );

  const header = (
    <View style={styles.headerRow}>
      {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
      <Text style={styles.title}>{profileDashboardCopy.workoutsTitle}</Text>
      {showPlus && !nativeHeader ? (
        <RoundIconButton accessibilityLabel="Log a workout" kind="plus" onPress={toggleWorkoutChooser} />
      ) : null}
    </View>
  );

  const chrome = nativeHeader ? (
    <Stack.Screen
      options={{
        ...pushedHeaderScreenOptions(),
        headerRight: showPlus
          ? () => <RoundIconButton accessibilityLabel="Log a workout" kind="plus" onPress={toggleWorkoutChooser} />
          : undefined,
      }}
    />
  ) : null;

  const filterSheet = (
    <WorkoutFilterSheet
      onApply={(next) => {
        setFilter(next);
        setSelectedId(null);
        void load(next);
      }}
      onDismiss={() => setFilterOpen(false)}
      timeZone={timeZone}
      value={filter}
      visible={filterOpen}
    />
  );

  if (!twoPane) {
    return (
      <>
        {chrome}
        <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
          <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
            {header}
            {list}
          </View>
        </SafeAreaView>
        {filterSheet}
      </>
    );
  }

  return (
    <>
      {chrome}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            contentPaddingBottom={spacing.xxl}
            fallback="hide-right"
            left={(
              <View style={styles.pane}>
                {header}
                {list}
              </View>
            )}
            right={(
              <View style={styles.pane}>
                {detailError ? (
                  <StateCard
                    actionLabel={profileDashboardCopy.tryAgain}
                    message={profileDashboardCopy.errorBody}
                    title={profileDashboardCopy.workoutsErrorTitle}
                  />
                ) : detail ? (
                  <PersonalWorkoutDetailContent timeZone={timeZone} workout={detail} />
                ) : (
                  <Text style={styles.muted}>Select a workout.</Text>
                )}
              </View>
            )}
            scrollableLeft={false}
            scrollableRight
          />
        </View>
      </SafeAreaView>
      {filterSheet}
    </>
  );
}

type ListItem =
  | { kind: "header"; id: string; label: string }
  | { kind: "workout"; id: string; workout: PersonalWorkoutListItem };

function groupByDate(workouts: PersonalWorkoutListItem[], timeZone: string): ListItem[] {
  const items: ListItem[] = [];
  let last: string | null = null;
  for (const workout of workouts) {
    const label = formatPerformedDateGroup(new Date(workout.occurredAt), timeZone);
    if (label !== last) {
      items.push({ kind: "header", id: `day:${label}`, label });
      last = label;
    }
    items.push({ kind: "workout", id: workout.id, workout });
  }
  return items;
}

function dedupeWorkouts(workouts: PersonalWorkoutListItem[]) {
  const seen = new Set<string>();
  return workouts.filter((workout) => {
    if (seen.has(workout.id)) return false;
    seen.add(workout.id);
    return true;
  });
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, gap: spacing.lg },
  headerRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  title: { color: colors.ink, flex: 1, ...type.screenTitle },
  listHeader: { gap: spacing.md, marginBottom: spacing.md },
  filter: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: size.hit,
  },
  filterText: { color: colors.brandPressed, ...type.label },
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  dateHeader: { color: colors.brandPressed, ...type.eyebrow },
  end: { color: colors.muted, paddingVertical: spacing.lg, ...type.bodySmall },
  muted: { color: colors.muted, ...type.bodySmall },
});
