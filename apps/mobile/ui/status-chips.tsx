import { StyleSheet, Text, View } from "react-native";

import { profileDashboardCopy } from "@repin/validation";

import {
  feedChipGap,
  feedChipHeight,
  feedChipPadding,
  feedChipTextStyle,
  goalFeedChipStyle,
  tonalFeedChipStyle,
} from "./community-feed-layout";
import { colors, radii, type } from "./theme";

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
        kind === "goal" ? goalFeedChipStyle() : kind === "pr" ? tonalFeedChipStyle() : styles.starting,
      ]}
    >
      <Text style={kind === "starting-best" ? styles.startingText : feedChipTextStyle()}>{label}</Text>
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
    gap: feedChipGap,
  },
  starting: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: feedChipHeight,
    justifyContent: "center",
    paddingHorizontal: feedChipPadding,
  },
  startingText: {
    color: colors.muted,
    ...type.micro,
  },
});
