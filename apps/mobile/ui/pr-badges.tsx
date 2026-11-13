import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import type { GoalBadge, PrBadge } from "@repin/types";

import {
  feedChipGap,
  feedChipTextStyle,
  goalFeedChipStyle,
  tonalFeedChipStyle,
} from "./community-feed-layout";
import {
  visibleMixedBadgeChips,
} from "./pr-badge-chips";
import { prCopy } from "./pr-copy";

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
        <View
          accessibilityLabel={chip.type === "goal" ? "Goal reached" : "Personal record"}
          key={`${chip.type}:${chip.id}`}
          style={chip.type === "goal" ? goalFeedChipStyle() : tonalFeedChipStyle()}
        >
          <Text style={feedChipTextStyle()}>{chip.type === "goal" ? "Goal" : "PR"}</Text>
        </View>
      ))}
      {visible.overflow > 0 ? (
        <View style={tonalFeedChipStyle()}>
          <Text style={feedChipTextStyle()}>{prCopy.overflow(visible.overflow)}</Text>
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
    gap: feedChipGap,
  },
});
