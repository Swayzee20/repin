import type { CommunityReactionCounts, CommunityReactionType } from "@repin/types";
import { communityReactionTypes } from "@repin/types";
import {
  communityReactionOptions,
  reactionAccessibilityLabel,
  reactionPillHitSlop,
} from "@repin/validation";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { colors, fonts, radii, size, spacing, type } from "./theme";

export function CardReactionBar({
  counts,
  disabled = false,
  onOpenWhoReacted,
  onToggle,
  viewerReaction,
}: {
  counts: CommunityReactionCounts;
  disabled?: boolean;
  onOpenWhoReacted?: (type: CommunityReactionType) => void;
  onToggle: (type: CommunityReactionType) => void;
  viewerReaction: CommunityReactionType | null;
}) {
  return (
    <View style={styles.row}>
      {communityReactionTypes.map((reactionType) => {
        const option = communityReactionOptions[reactionType];
        const count = counts[reactionType];
        const selected = viewerReaction === reactionType;
        const hitSlop = reactionPillHitSlop(count);
        return (
          <View
            key={reactionType}
            style={[styles.pill, selected && styles.pillSelected]}
          >
            <Pressable
              accessibilityLabel={reactionAccessibilityLabel(reactionType, count, selected)}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              hitSlop={hitSlop}
              onPress={() => onToggle(reactionType)}
              style={(state) => [
                styles.emojiHit,
                webFocusRing(pressableFocused(state)),
                state.pressed && styles.pressed,
              ]}
            >
              <Text style={styles.emoji}>{option.emoji}</Text>
            </Pressable>
            {count > 0 ? (
              <Pressable
                accessibilityLabel={`${count} ${option.label} ${count === 1 ? "reaction" : "reactions"}. Show who reacted`}
                accessibilityRole="button"
                disabled={disabled}
                hitSlop={hitSlop}
                onPress={() => (onOpenWhoReacted ? onOpenWhoReacted(reactionType) : onToggle(reactionType))}
                style={(state) => [
                  styles.countHit,
                  webFocusRing(pressableFocused(state)),
                  state.pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.count, selected && styles.countSelected]}>{count}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    height: spacing.xxxl,
    paddingHorizontal: spacing.md - spacing.xs / 2,
  },
  pillSelected: {
    backgroundColor: colors.brandTint,
    borderColor: colors.brandPressed,
  },
  emojiHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing.xxxl,
  },
  countHit: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm - spacing.xs / 2,
    minHeight: spacing.xxxl,
  },
  emoji: {
    fontSize: size.icon.sm,
    lineHeight: size.icon.sm,
  },
  count: {
    color: colors.inkSoft,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  countSelected: {
    color: colors.brandPressed,
  },
  pressed: {
    opacity: 0.72,
  },
});
