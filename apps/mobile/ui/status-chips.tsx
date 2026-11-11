import { StyleSheet, Text, View } from "react-native";

import { profileDashboardCopy } from "@repin/validation";

import { colors, radii, spacing, type } from "./theme";

export type StatusChipKind = "goal" | "pr" | "starting-best";

export function StatusChip({ kind }: { kind: StatusChipKind }) {
  const label = kind === "goal" ? "Goal" : kind === "pr" ? "PR" : profileDashboardCopy.startingBest;
  const accessibilityLabel = kind === "goal"
    ? "Goal reached"
    : kind === "pr"
      ? "Personal record"
      : profileDashboardCopy.startingBestA11y;
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
      style={[
        styles.chip,
        kind === "goal" && styles.goal,
        kind === "pr" && styles.pr,
        kind === "starting-best" && styles.starting,
      ]}
    >
      <Text style={[styles.text, kind === "starting-best" && styles.startingText]}>{label}</Text>
    </View>
  );
}

export function StatusChipRow({
  goal = false,
  pr = false,
  startingBest = false,
}: {
  goal?: boolean;
  pr?: boolean;
  startingBest?: boolean;
}) {
  if (!goal && !pr && !startingBest) return null;
  return (
    <View style={styles.row}>
      {goal ? <StatusChip kind="goal" /> : null}
      {pr ? <StatusChip kind="pr" /> : null}
      {startingBest ? <StatusChip kind="starting-best" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  goal: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderWidth: 2,
  },
  pr: {
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderWidth: 1,
  },
  starting: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  text: {
    color: colors.brandPressed,
    ...type.micro,
  },
  startingText: {
    color: colors.muted,
  },
});
