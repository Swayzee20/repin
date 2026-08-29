import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, type } from "./theme";

export function CheckInEmptyContent({ onCheckIn }: { onCheckIn?: () => void }) {
  return (
    <>
      <Feather color={colors.brand} name="activity" size={18} />
      <Text style={styles.secondary}>No workouts logged yet</Text>
      <Text style={styles.primary}>Be the first to check in</Text>
      {onCheckIn ? (
        <Pressable
          accessibilityLabel="Check in"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onCheckIn}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Feather color={colors.surface} name="plus" size={18} />
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  secondary: { alignSelf: "center", color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  primary: { alignSelf: "center", color: colors.ink, ...type.heading, marginTop: spacing.sm },
  action: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    marginTop: spacing.md,
    width: 60,
  },
  actionPressed: { backgroundColor: colors.brandPressed },
});
