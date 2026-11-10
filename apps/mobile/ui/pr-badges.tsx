import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import type { GoalBadge, PrBadge } from "@repin/types";

import {
  visibleMixedBadgeChips,
} from "./pr-badge-chips";
import { prCopy } from "./pr-copy";
import { colors, radii, spacing, type } from "./theme";

export {
  mixedBadgeAccessibilityLabel,
  prBadgeAccessibilityLabel,
  visibleMixedBadgeChips,
  visiblePrBadgeChips,
  type AchievementChip,
} from "./pr-badge-chips";

export function PrBadgeRow({
  badges,
  goalBadges,
  style,
}: {
  badges?: PrBadge[];
  goalBadges?: GoalBadge[];
  style?: StyleProp<ViewStyle>;
}) {
  if (!badges?.length && !goalBadges?.length) return null;
  const visible = visibleMixedBadgeChips(goalBadges, badges);
  return (
    <View
      accessibilityLabel={visible.accessibilityLabel}
      accessible
      style={[styles.row, style]}
    >
      {visible.chips.map((chip) => (
        <View key={`${chip.type}:${chip.id}`} style={chip.type === "goal" ? styles.goalChip : styles.chip}>
          <Text style={styles.chipText}>{chip.type === "goal" ? "Goal" : "PR"}</Text>
        </View>
      ))}
      {visible.overflow > 0 ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{prCopy.overflow(visible.overflow)}</Text>
        </View>
      ) : null}
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
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  goalChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderRadius: radii.sm,
    borderWidth: 2,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    color: colors.brandPressed,
    ...type.micro,
  },
});
