import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { colors, fonts, size, spacing, type } from "./theme";

export { OWNER_NOTICE_ACTION, OWNER_NOTICE_BODY } from "./notice-banner-copy";

const noticeLineHeight = Math.round(type.bodySmall.fontSize * 1.35);

export function NoticeBanner({
  actionLabel,
  body,
  onAction,
  onDismiss,
}: {
  actionLabel?: string;
  body: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card accessibilityLabel={body} accessibilityRole="summary" style={styles.card}>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={spacing.xs}
            onPress={onAction}
            style={(state) => [styles.actionHit, webFocusRing(pressableFocused(state))]}
          >
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : <View />}
        <Pressable
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={onDismiss}
          style={(state) => [styles.actionHit, webFocusRing(pressableFocused(state))]}
        >
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  body: {
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: noticeLineHeight,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: size.hit,
  },
  actionHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: size.hit,
    minWidth: size.hit,
  },
  action: {
    color: colors.brand,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  dismiss: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
});
