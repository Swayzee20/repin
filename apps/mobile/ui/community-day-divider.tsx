import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "./theme";

export function CommunityDayDivider({
  accessibilityLabel,
  first = false,
  label,
}: {
  accessibilityLabel: string;
  first?: boolean;
  label: string;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="header"
      accessible
      pointerEvents="none"
      style={[styles.row, first ? styles.first : styles.following]}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.label}
      >
        {label}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rule}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    marginBottom: spacing.sm,
    width: "100%",
  },
  first: { marginTop: 0 },
  following: { marginTop: spacing.lg },
  label: {
    color: colors.muted,
    ...type.label,
  },
  rule: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
    marginLeft: spacing.sm,
  },
});
