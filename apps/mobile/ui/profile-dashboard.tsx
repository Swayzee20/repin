import type {
  CurrentBest,
  PersonalRecordKind,
  PersonalWorkoutListItem,
  WorkoutPeriodStats,
} from "@repin/types";
import { personalRecordKindGroupLabels } from "@repin/types";
import {
  formatPerformedDateGroup,
  formatTotalsDistance,
  formatTotalsTime,
  identityThisWeekLabel,
  profileDashboardCopy,
  totalsCoverageLine,
  type DashboardDistanceUnit,
  type TotalsCoverageInput,
} from "@repin/validation";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, formatWorkoutType, StateCard } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { ListRow } from "./primitives";
import { StatusChip } from "./status-chips";
import { colors, fonts, radii, size, spacing, type } from "./theme";

export function SectionSkeleton() {
  return (
    <Card>
      <View style={styles.skelTitle} />
      <View style={styles.skelLine} />
      <View style={[styles.skelLine, styles.skelShort]} />
    </Card>
  );
}

export function StaleBanner({
  onRetry,
  time,
}: {
  onRetry: () => void;
  time: string;
}) {
  return (
    <View style={styles.stale}>
      <Text style={styles.staleText}>{profileDashboardCopy.stale(time)}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={(state) => [styles.staleAction, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.staleActionText}>{profileDashboardCopy.tryAgain}</Text>
      </Pressable>
    </View>
  );
}

export function TotalsCard({
  distanceUnit,
  loading,
  month,
  onChangeUnit,
  onOpenHelp,
  week,
}: {
  distanceUnit: DashboardDistanceUnit;
  loading?: boolean;
  month: WorkoutPeriodStats | null;
  onChangeUnit: (unit: DashboardDistanceUnit) => void;
  onOpenHelp: () => void;
  week: WorkoutPeriodStats | null;
}) {
  if (loading && !week) return <SectionSkeleton />;
  if (!week || !month) return null;
  return (
    <Card style={styles.totals}>
      <View style={styles.totalsRow}>
        <PeriodColumn distanceUnit={distanceUnit} stats={week} title={profileDashboardCopy.thisWeek} />
        <PeriodColumn distanceUnit={distanceUnit} stats={month} title={profileDashboardCopy.thisMonth} />
      </View>
      <Text style={styles.coverage}>{totalsCoverageLine(coverageInput(week, distanceUnit))}</Text>
      <View style={styles.unitRow}>
        <Pressable
          accessibilityLabel="Show distances in miles"
          accessibilityRole="button"
          accessibilityState={{ selected: distanceUnit === "mi" }}
          onPress={() => onChangeUnit("mi")}
          style={(state) => [styles.unitChip, distanceUnit === "mi" && styles.unitChipSelected, webFocusRing(pressableFocused(state))]}
        >
          <Text style={[styles.unitText, distanceUnit === "mi" && styles.unitTextSelected]}>mi</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Show distances in kilometers"
          accessibilityRole="button"
          accessibilityState={{ selected: distanceUnit === "km" }}
          onPress={() => onChangeUnit("km")}
          style={(state) => [styles.unitChip, distanceUnit === "km" && styles.unitChipSelected, webFocusRing(pressableFocused(state))]}
        >
          <Text style={[styles.unitText, distanceUnit === "km" && styles.unitTextSelected]}>km</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenHelp}
        style={(state) => [styles.help, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.helpText}>{profileDashboardCopy.whatsIncluded}</Text>
      </Pressable>
    </Card>
  );
}

function PeriodColumn({
  distanceUnit,
  stats,
  title,
}: {
  distanceUnit: DashboardDistanceUnit;
  stats: WorkoutPeriodStats;
  title: string;
}) {
  const empty = stats.workoutCount === 0;
  const time = formatTotalsTime(coverageInput(stats, distanceUnit));
  const distance = formatTotalsDistance(coverageInput(stats, distanceUnit));
  return (
    <View style={styles.period}>
      <Text style={styles.periodTitle}>{title}</Text>
      <Text style={styles.range}>{stats.rangeLabel}</Text>
      {empty ? (
        <Text style={styles.emptyValue}>{profileDashboardCopy.noWorkoutsValue}</Text>
      ) : (
        <>
          <Text style={styles.count}>{stats.workoutCount}</Text>
          <Text style={styles.countUnit}>{stats.workoutCount === 1 ? "workout" : "workouts"}</Text>
          {time ? <Text style={styles.metric}>{time}</Text> : null}
          {distance ? <Text style={styles.metric}>{distance}</Text> : null}
        </>
      )}
    </View>
  );
}

export function coverageInput(stats: WorkoutPeriodStats, distanceUnit: DashboardDistanceUnit): TotalsCoverageInput {
  return {
    workoutCount: stats.workoutCount,
    recordedSeconds: stats.recordedSeconds,
    recordedMeters: stats.recordedMeters,
    missingDurationCount: stats.missingDurationCount,
    loggedDistanceUnits: stats.loggedDistanceUnits,
    distanceUnit,
  };
}

export function IdentitySubtitle({ count }: { count: number }) {
  return <Text style={styles.identitySub}>{identityThisWeekLabel(count)}</Text>;
}

export function RecentWorkoutsSection({
  error,
  loading,
  onOpen,
  onRetry,
  onViewAll,
  timeZone,
  workouts,
}: {
  error: string | null;
  loading: boolean;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onViewAll: () => void;
  timeZone: string;
  workouts: PersonalWorkoutListItem[] | null;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{profileDashboardCopy.recentTitle}</Text>
      {error && !workouts ? (
        <StateCard
          actionLabel={profileDashboardCopy.tryAgain}
          message={profileDashboardCopy.errorBody}
          onAction={onRetry}
          title={profileDashboardCopy.workoutsErrorTitle}
        />
      ) : loading && !workouts ? (
        <SectionSkeleton />
      ) : !workouts?.length ? (
        <Card>
          <Text style={styles.emptyTitle}>{profileDashboardCopy.recentEmptyTitle}</Text>
          <Text style={styles.emptyBody}>{profileDashboardCopy.recentEmptyBody}</Text>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {workouts.slice(0, 3).map((workout, index) => (
            <View key={workout.id} style={index > 0 ? styles.rowRule : undefined}>
              <WorkoutHistoryRow nested onPress={() => onOpen(workout.id)} timeZone={timeZone} workout={workout} />
            </View>
          ))}
          <View style={styles.rowRule}>
            <ListRow label={profileDashboardCopy.viewAllWorkouts} onPress={onViewAll} />
          </View>
        </Card>
      )}
    </View>
  );
}

export function CurrentBestsPreview({
  bests,
  error,
  loading,
  onOpen,
  onRetry,
  onViewAll,
}: {
  bests: CurrentBest[] | null;
  error: string | null;
  loading: boolean;
  onOpen: (best: CurrentBest) => void;
  onRetry: () => void;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{profileDashboardCopy.bestsTitle}</Text>
      {error && !bests ? (
        <StateCard
          actionLabel={profileDashboardCopy.tryAgain}
          message={profileDashboardCopy.errorBody}
          onAction={onRetry}
          title={profileDashboardCopy.bestsErrorTitle}
        />
      ) : loading && !bests ? (
        <SectionSkeleton />
      ) : !bests?.length ? (
        <Card>
          <Text style={styles.emptyTitle}>{profileDashboardCopy.bestsEmptyTitle}</Text>
          <Text style={styles.emptyBody}>{profileDashboardCopy.bestsEmptyBody}</Text>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {bests.slice(0, 3).map((best, index) => (
            <View key={best.id} style={index > 0 ? styles.rowRule : undefined}>
              <CurrentBestRow best={best} nested onPress={() => onOpen(best)} />
            </View>
          ))}
          <View style={styles.rowRule}>
            <ListRow label={profileDashboardCopy.viewAllBests} onPress={onViewAll} />
          </View>
        </Card>
      )}
    </View>
  );
}

export function WorkoutHistoryRow({
  nested = false,
  onPress,
  selected = false,
  timeZone,
  workout,
}: {
  nested?: boolean;
  onPress: () => void;
  selected?: boolean;
  timeZone: string;
  workout: PersonalWorkoutListItem;
}) {
  const typeLabel = formatWorkoutType(workout.workoutType);
  const summary = workout.resultSummary?.trim()
    || (workout.hasDetailedResults ? null : profileDashboardCopy.quickLogTitle);
  const body = (
    <View style={[styles.historyCard, nested && styles.nestedRow]}>
      <View style={styles.historyTop}>
        <Text style={styles.historyTitle}>{workout.title}</Text>
        <View style={styles.typeChip}><Text style={styles.typeChipText}>{typeLabel}</Text></View>
      </View>
      <Text style={styles.historyMeta}>{formatPerformedDateGroup(new Date(workout.occurredAt), timeZone)}</Text>
      {summary ? <Text style={styles.historyMeta}>{summary}</Text> : null}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [webFocusRing(pressableFocused(state))]}
    >
      {nested ? body : <Card selected={selected}>{body}</Card>}
    </Pressable>
  );
}

export function CurrentBestRow({
  best,
  nested = false,
  onPress,
  selected = false,
}: {
  best: CurrentBest;
  nested?: boolean;
  onPress: () => void;
  selected?: boolean;
}) {
  const missing = !best.sourceAvailable;
  const body = (
    <View style={[styles.historyCard, nested && styles.nestedRow]}>
      <View style={styles.bestTop}>
        <Text style={styles.historyTitle}>{best.label}</Text>
        <StatusChip kind={best.baselineOnly ? "starting-best" : "pr"} />
      </View>
      <Text style={styles.bestValue}>{best.value}</Text>
      {missing ? <Text style={styles.historyMeta}>{profileDashboardCopy.missingSource}</Text> : null}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [webFocusRing(pressableFocused(state))]}
    >
      {nested ? body : <Card selected={selected}>{body}</Card>}
    </Pressable>
  );
}

export function groupedBests(bests: CurrentBest[]) {
  const order: PersonalRecordKind[] = ["heaviest_single", "distance_time", "amrap", "for_time"];
  return order
    .map((kind) => ({
      kind,
      label: personalRecordKindGroupLabels[kind],
      items: bests.filter((best) => best.kind === kind),
    }))
    .filter((group) => group.items.length > 0);
}

export function CrewsBlock({
  groups,
  onJoin,
  onOpen,
}: {
  groups: Array<{ id: string; name: string; role: string }>;
  onJoin: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{profileDashboardCopy.crewsTitle}</Text>
      {groups.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>{profileDashboardCopy.noCrewsTitle}</Text>
          <Text style={styles.emptyBody}>{profileDashboardCopy.noCrewsBody}</Text>
          <Button onPress={onJoin} variant="secondary">{profileDashboardCopy.joinCrew}</Button>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {groups.map((group, index) => (
            <View key={group.id} style={index > 0 ? styles.rowRule : undefined}>
              <ListRow
                label={group.name}
                leading={<CrewMark name={group.name} />}
                onPress={() => onOpen(group.id)}
                value={roleLabel(group.role)}
              />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function CrewMark({ name }: { name: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.crewMark}>
      <Text style={styles.crewMarkText}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}

function roleLabel(role: string) {
  return role ? role.slice(0, 1).toUpperCase() + role.slice(1) : role;
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  blockTitle: { color: colors.ink, ...type.section },
  totals: { gap: spacing.md },
  totalsRow: { flexDirection: "row", gap: spacing.lg },
  period: { flex: 1, gap: spacing.xs },
  periodTitle: { color: colors.ink, ...type.section },
  range: { color: colors.muted, ...type.bodySmall },
  count: { color: colors.ink, ...type.display },
  countUnit: { color: colors.muted, ...type.bodySmall },
  metric: { color: colors.ink, ...type.body },
  emptyValue: { color: colors.ink, ...type.heading },
  coverage: { color: colors.muted, ...type.bodySmall },
  unitRow: { flexDirection: "row", gap: spacing.sm },
  unitChip: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: size.hit,
    minWidth: size.hit,
    paddingHorizontal: spacing.md,
  },
  unitChipSelected: {
    backgroundColor: colors.brandTint,
    borderColor: colors.brand,
  },
  unitText: { color: colors.muted, ...type.label },
  unitTextSelected: { color: colors.brandPressed },
  help: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: size.hit,
  },
  helpText: { color: colors.brandPressed, ...type.label },
  identitySub: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  listCard: { overflow: "hidden", padding: 0 },
  rowRule: { borderTopColor: colors.border, borderTopWidth: 1 },
  emptyTitle: { color: colors.ink, ...type.heading },
  emptyBody: { color: colors.muted, marginTop: spacing.sm, ...type.bodySmall },
  historyCard: { gap: spacing.xs },
  nestedRow: { padding: spacing.lg },
  historyTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  historyTitle: { color: colors.ink, flex: 1, ...type.heading },
  historyMeta: { color: colors.muted, ...type.bodySmall },
  typeChip: {
    backgroundColor: colors.brandTint,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typeChipText: { color: colors.brandPressed, ...type.micro },
  bestTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  bestValue: { color: colors.ink, ...type.body, fontFamily: fonts.semibold },
  stale: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
  staleText: { color: colors.inkSoft, flex: 1, ...type.bodySmall },
  staleAction: {
    justifyContent: "center",
    minHeight: size.hit,
  },
  staleActionText: { color: colors.brandPressed, ...type.label },
  skelTitle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: spacing.xl,
    marginBottom: spacing.md,
  },
  skelLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: spacing.md,
    marginBottom: spacing.sm,
  },
  skelShort: { width: "60%" },
  crewMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: size.avatars.md,
    justifyContent: "center",
    width: size.avatars.md,
  },
  crewMarkText: { color: colors.brand, ...type.body, fontFamily: fonts.bold },
});
