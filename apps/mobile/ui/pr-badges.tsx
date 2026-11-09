import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import type { PrBadge } from "@repin/types";

import { prCopy } from "./pr-copy";
import { colors, radii, spacing, type } from "./theme";

export function prBadgeAccessibilityLabel(count: number) {
  return count === 1 ? prCopy.personalRecordChip : `${count} personal records`;
}

export function visiblePrBadgeChips<T>(badges: T[]) {
  const extra = Math.max(0, badges.length - 2);
  return {
    accessibilityLabel: prBadgeAccessibilityLabel(badges.length),
    chips: badges.slice(0, 2),
    overflow: extra,
  };
}

export function PrBadgeRow({
  badges,
  style,
}: {
  badges: PrBadge[] | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  if (!badges?.length) return null;
  const visible = visiblePrBadgeChips(badges);
  return (
    <View
      accessibilityLabel={visible.accessibilityLabel}
      accessible
      style={[styles.row, style]}
    >
      {visible.chips.map((badge) => (
        <View key={badge.id} style={styles.chip}>
          <Text style={styles.chipText}>PR</Text>
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
  chipText: {
    color: colors.brandPressed,
    ...type.micro,
  },
});
