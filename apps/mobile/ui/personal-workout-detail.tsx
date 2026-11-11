import {
  formatGroupedIntervalSegment,
  groupConsecutiveIntervalSegments,
  type PersonalWorkoutDetail,
} from "@repin/types";
import {
  formatDashboardDistance,
  formatPerformedDateTime,
  formatRecordedDuration,
  metersFromLoggedDistance,
  profileDashboardCopy,
} from "@repin/validation";
import { StyleSheet, Text, View } from "react-native";

import {
  buildDetailMetricRows,
  formatEmomIntervalLabel,
  formatFfMovementLine,
  formatFfMovementsHeading,
  formatSetGroupLabel,
  formatWorkoutSet,
  groupIdenticalConsecutiveSets,
} from "../lib/workout-detail-format";
import { Card, formatWorkoutType } from "./components";
import { StatusChip, StatusChipRow } from "./status-chips";
import { colors, fonts, spacing, type } from "./theme";

export function PersonalWorkoutDetailContent({
  timeZone,
  workout,
}: {
  timeZone: string;
  workout: PersonalWorkoutDetail;
}) {
  const typeLabel = formatWorkoutType(workout.workoutType);
  const title = workout.name?.trim() || workout.title?.trim() || typeLabel;
  const formattedMetrics = buildDetailMetricRows(workout);
  const groupedIntervals = groupConsecutiveIntervalSegments(workout.segments);
  const formatDetail = workout.format ?? null;
  const ffMovementHeading = formatDetail ? formatFfMovementsHeading(formatDetail) : null;
  const pace = formatWorkoutPace(workout);
  const intervalCoverage = formatIntervalCoverage(workout);
  const minutesLabel = workout.durationMinutes
    ? `${workout.durationMinutes} min`
    : workout.recordedSeconds
      ? formatRecordedDuration(workout.recordedSeconds)
      : null;

  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Text style={styles.type}>{typeLabel}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{formatPerformedDateTime(new Date(workout.occurredAt), timeZone)}</Text>
        {workout.effort ? (
          <Text accessibilityLabel={`Effort ${workout.effort} out of 5`} style={styles.effort}>
            {`${"🔥".repeat(workout.effort)}`}
          </Text>
        ) : null}
        {minutesLabel ? <Text style={styles.meta}>{minutesLabel}</Text> : null}
        <StatusChipRow
          goal={Boolean(workout.goalBadges.length)}
          pr={Boolean(workout.prBadges.length)}
          startingBest={workout.baselineOnly}
        />
      </View>

      {!workout.hasDetailedResults ? (
        <Card>
          <Text style={styles.emptyTitle}>{profileDashboardCopy.quickLogTitle}</Text>
          <Text style={styles.emptyBody}>
            {workout.durationMinutes
              ? profileDashboardCopy.quickLogBodyWithMinutes
              : profileDashboardCopy.quickLogBody}
          </Text>
        </Card>
      ) : (
        <View style={styles.results}>
          {formattedMetrics.length ? (
            <Card>
              {formattedMetrics.map((metric, index) => (
                <View key={`${metric.label}-${index}`} style={[styles.metricRow, index > 0 && styles.divided]}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {pace ? <Text style={styles.helper}>{profileDashboardCopy.runHelper}</Text> : null}
          {pace ? <Text style={styles.helper}>Pace {pace}</Text> : null}

          {workout.segments.length ? (
            <Card>
              <Text style={styles.blockTitle}>Intervals</Text>
              {groupedIntervals.map((group, index) => {
                const formatted = formatGroupedIntervalSegment(group);
                return (
                  <View key={`${group.segment.segmentType}-${index}`} style={[styles.intervalRow, index > 0 && styles.divided]}>
                    <Text style={styles.metricValue}>{formatted.main}</Text>
                    {formatted.recovery ? <Text style={styles.recovery}>{formatted.recovery}</Text> : null}
                  </View>
                );
              })}
              {workout.segments.map((segment) => (
                segment.notes ? <Text key={`note:${segment.id}`} style={styles.notes}>{segment.notes}</Text> : null
              ))}
              {intervalCoverage ? <Text style={styles.helper}>{intervalCoverage}</Text> : null}
            </Card>
          ) : null}

          {ffMovementHeading && workout.movements.length ? (
            <Card>
              <Text style={styles.blockTitle}>{ffMovementHeading}</Text>
              {workout.movements.map((movement, index) => (
                formatDetail?.type === "emom" ? (
                  <View key={movement.id} style={[styles.metricRow, index > 0 && styles.divided]}>
                    <Text style={styles.metricLabel}>
                      {formatEmomIntervalLabel(index, formatDetail.intervalSeconds)}
                    </Text>
                    <Text style={styles.metricValue}>{formatFfMovementLine(movement)}</Text>
                  </View>
                ) : (
                  <View key={movement.id} style={[styles.ffRow, index > 0 && styles.divided]}>
                    <Text style={styles.ffLine}>{formatFfMovementLine(movement)}</Text>
                  </View>
                )
              ))}
            </Card>
          ) : workout.movements.map((movement) => {
            const groupedSets = groupIdenticalConsecutiveSets(movement.sets);
            return (
              <Card key={movement.id}>
                <View style={styles.movementHead}>
                  <Text style={styles.blockTitle}>{movement.movementName}</Text>
                </View>
                {movement.notes ? <Text style={styles.notes}>{movement.notes}</Text> : null}
                {groupedSets.map((group, index) => {
                  const setId = group.set.id;
                  const isPr = workout.currentBestSetIds.includes(setId);
                  const isStarting = workout.startingBestSetIds.includes(setId);
                  return (
                    <View key={`${setId}:${group.startIndex}`} style={[styles.setRow, index > 0 && styles.divided]}>
                      <Text style={styles.metricLabel}>{formatSetGroupLabel(group)}</Text>
                      <View style={styles.setResult}>
                        <Text style={styles.metricValue}>{formatWorkoutSet(group.set)}</Text>
                        {isPr ? <StatusChip kind="pr" /> : null}
                        {isStarting ? <StatusChip kind="starting-best" /> : null}
                        {group.set.notes ? <Text style={styles.notes}>{group.set.notes}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

function formatWorkoutPace(workout: PersonalWorkoutDetail) {
  if (workout.workoutType !== "run" && workout.workoutType !== "walk" && workout.workoutType !== "cycling") {
    return null;
  }
  const distance = workout.metrics.find((metric) => metric.metricType === "distance");
  const duration = workout.metrics.find((metric) => metric.metricType === "duration");
  if (distance?.numericValue == null || duration?.numericValue == null) return null;
  const meters = metersFromLoggedDistance(distance.numericValue, distance.unit);
  if (meters == null || !(duration.numericValue > 0)) return null;
  const unit = distance.unit === "km" ? "km" : "mi";
  const unitMeters = unit === "km" ? 1_000 : 1_609.344;
  const seconds = duration.numericValue / meters * unitMeters;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")} /${unit}`;
}

function formatIntervalCoverage(workout: PersonalWorkoutDetail) {
  if (!workout.segments.length) return null;
  let meters = 0;
  let hasDistance = false;
  let seconds = 0;
  let hasTime = false;
  for (const segment of workout.segments) {
    if (segment.segmentType !== "work") continue;
    const distance = segment.distance != null
      ? metersFromLoggedDistance(segment.distance, segment.distanceUnit)
      : null;
    if (distance != null) {
      meters += distance;
      hasDistance = true;
    }
    if (segment.durationSeconds != null && segment.durationSeconds > 0) {
      seconds += segment.durationSeconds;
      hasTime = true;
    }
  }
  const parts: string[] = [];
  if (hasDistance || hasTime) {
    const units = [...new Set(
      workout.segments
        .filter((segment) => segment.segmentType === "work" && segment.distance != null && segment.distanceUnit)
        .map((segment) => segment.distanceUnit as "m" | "km" | "mi"),
    )];
    const unit = units.length === 1 ? (units[0] ?? "m") : "m";
    const distanceLabel = hasDistance
      ? unit === "m"
        ? `${Math.round(meters)} m`
        : formatDashboardDistance(meters, unit)
      : null;
    const timeLabel = hasTime ? formatRecordedDuration(seconds) : null;
    parts.push(`Work total ${[distanceLabel, timeLabel].filter(Boolean).join(" · ")}.`);
  }
  parts.push(profileDashboardCopy.intervalRecovery);
  const overall = workout.metrics.some((metric) => metric.metricType === "duration" && metric.numericValue != null);
  if (!overall && workout.recordedSeconds == null && !workout.durationMinutes) {
    parts.push(profileDashboardCopy.noOverallTime);
  }
  return parts.join(" ");
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  header: { gap: spacing.sm },
  type: { color: colors.brandPressed, ...type.eyebrow },
  title: { color: colors.ink, ...type.screenTitle },
  meta: { color: colors.muted, ...type.bodySmall },
  effort: { ...type.body },
  results: { gap: spacing.md },
  metricRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  divided: { borderTopColor: colors.border, borderTopWidth: 1 },
  metricLabel: { color: colors.muted, ...type.label },
  metricValue: { color: colors.ink, flex: 1, textAlign: "right", ...type.body, fontFamily: fonts.semibold },
  helper: { color: colors.muted, ...type.bodySmall },
  intervalRow: { gap: spacing.xs, paddingVertical: spacing.sm },
  recovery: { color: colors.muted, ...type.bodySmall },
  blockTitle: { color: colors.ink, ...type.heading },
  ffRow: { paddingVertical: spacing.sm },
  ffLine: { color: colors.ink, ...type.body },
  movementHead: { marginBottom: spacing.sm },
  notes: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  setRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  setResult: { alignItems: "flex-end", flex: 1, gap: spacing.xs },
  emptyTitle: { color: colors.ink, ...type.heading },
  emptyBody: { color: colors.muted, marginTop: spacing.sm, ...type.bodySmall },
});
