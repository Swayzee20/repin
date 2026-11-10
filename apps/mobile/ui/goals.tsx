import type { GoalSummary, GoalsListResponse } from "@repin/types";
import { goalCopy } from "@repin/validation";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, StateCard } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { percentLabel } from "./goal-form-state";
import { colors, fonts, radii, spacing, type } from "./theme";

export function GoalsSection({
  cap,
  error,
  goals,
  loading,
  onAdd,
  onHistory,
  onOpen,
  onRetry,
}: {
  cap: number;
  error: string | null;
  goals: GoalsListResponse | null;
  loading: boolean;
  onAdd: () => void;
  onHistory: () => void;
  onOpen: (goalId: string) => void;
  onRetry: () => void;
}) {
  const active = goals?.active ?? [];
  const atCap = active.length >= cap;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Goals</Text>
      {error && !goals ? (
        <StateCard
          actionLabel={goalCopy.errorAction}
          message={goalCopy.errorBody}
          onAction={onRetry}
          title={goalCopy.errorTitle}
        />
      ) : loading && !goals ? (
        <Card><Text style={styles.muted}>Loading goals…</Text></Card>
      ) : !active.length ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{goalCopy.emptyTitle}</Text>
          <Text style={styles.muted}>{goalCopy.emptyBody}</Text>
          <Button onPress={onAdd}>{goalCopy.emptyAction}</Button>
        </Card>
      ) : (
        <View style={styles.stack}>
          {active.map((goal) => (
            <GoalProgressCard key={goal.id} goal={goal} onPress={() => onOpen(goal.id)} />
          ))}
          {atCap ? <Text style={styles.helper}>{goalCopy.cap}</Text> : (
            <Button onPress={onAdd} variant="tonal">{goalCopy.addGoal}</Button>
          )}
          <Button onPress={onHistory} variant="secondary">{goalCopy.history}</Button>
        </View>
      )}
    </View>
  );
}

export function GoalProgressCard({
  goal,
  onPress,
}: {
  goal: GoalSummary;
  onPress?: () => void;
}) {
  const complete = goal.state === "reached" || goal.progress.ratio >= 1;
  const body = (
    <Card>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{goal.title}</Text>
        <GoalStatusChip goal={goal} />
      </View>
      {goal.progress.periodLabel ? (
        <Text style={styles.period}>{goal.progress.periodLabel}</Text>
      ) : null}
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: complete ? colors.success : colors.brand,
              flexGrow: Math.min(1, Math.max(0.02, goal.progress.ratio)),
            },
          ]}
        />
        <View style={{ flexGrow: Math.max(0, 1 - goal.progress.ratio) }} />
      </View>
      <View style={styles.progressMeta}>
        <Text style={styles.muted}>{goal.progress.label}</Text>
        <Text style={styles.percent}>{percentLabel(goal.progress.ratio)}</Text>
      </View>
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [webFocusRing(pressableFocused(state))]}
    >
      {body}
    </Pressable>
  );
}

export function GoalStatusChip({ goal }: { goal: GoalSummary }) {
  const tone = statusTone(goal);
  return (
    <View style={[styles.chip, { backgroundColor: tone.background }]}>
      <Text style={[styles.chipText, { color: tone.color }]}>{tone.label}</Text>
    </View>
  );
}

function statusTone(goal: GoalSummary) {
  if (goal.state === "reached" && goal.completionMethod === "manual") {
    return { background: colors.surfaceMuted, color: colors.muted, label: "Marked done" };
  }
  if (goal.state === "reached") {
    return { background: colors.successSoft, color: colors.success, label: "Reached" };
  }
  if (goal.state === "expired") {
    return { background: colors.surfaceMuted, color: colors.muted, label: "Expired" };
  }
  if (goal.state === "archived") {
    return { background: colors.surfaceMuted, color: colors.muted, label: "Archived" };
  }
  return { background: colors.brandTint, color: colors.brandPressed, label: "In progress" };
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  blockTitle: { color: colors.ink, ...type.section },
  stack: { gap: spacing.md },
  emptyCard: { gap: spacing.md },
  emptyTitle: { color: colors.ink, ...type.heading },
  muted: { color: colors.muted, ...type.bodySmall },
  helper: { color: colors.muted, ...type.bodySmall },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  cardTitle: { color: colors.ink, flex: 1, ...type.heading },
  period: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  track: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexDirection: "row",
    height: spacing.sm,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  fill: {
    borderRadius: radii.pill,
    minWidth: spacing.xs,
  },
  progressMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  percent: { ...type.label, color: colors.ink, fontFamily: fonts.bold },
  chip: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  chipText: { ...type.micro },
});
