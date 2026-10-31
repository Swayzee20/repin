import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron, Icon, type IconName } from "./icons";
import { menuItemColor, menuItemMinHeight } from "./overlay-state";
import { colors, elevation, fonts, radii, spacing, type } from "./theme";

export function Menu({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.menu, style]}>{children}</View>;
}

export function MenuItem({
  accessibilityLabel,
  danger = false,
  detail,
  disabled = false,
  icon,
  label,
  onPress,
  selected = false,
  showChevron = false,
}: {
  accessibilityLabel?: string;
  danger?: boolean;
  detail?: string;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  showChevron?: boolean;
}) {
  const color = disabled ? colors.disabledText : menuItemColor(danger);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label}. ${detail}` : label)}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={(state) => [
        styles.item,
        (selected || state.pressed) && !disabled && styles.itemPressed,
        webFocusRing(pressableFocused(state)),
      ]}
    >
      {icon ? <Icon color={color} name={icon} /> : null}
      <View style={styles.copy}>
        <Text numberOfLines={detail ? 2 : 1} style={[styles.label, { color }]}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {selected ? <Icon color={colors.brand} name="checkmark" /> : null}
      {showChevron ? <Chevron /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    boxShadow: elevation.e2,
    padding: spacing.xs,
  },
  item: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: menuItemMinHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  itemPressed: { backgroundColor: colors.selection },
  copy: { flex: 1, gap: spacing.xs },
  label: { ...type.body, fontFamily: fonts.semibold },
  detail: { ...type.bodySmall, color: colors.muted },
});
