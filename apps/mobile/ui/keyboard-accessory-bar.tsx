import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron } from "./icons";
import {
  keyboardAccessorySnapshot,
  runKeyboardAccessory,
  type AccessoryCommand,
} from "./keyboard-accessory";
import { colors, fonts, radii, size, spacing, type } from "./theme";

export function KeyboardAccessoryBar({ command }: { command: AccessoryCommand }) {
  const label = command.label;
  const context = command.context?.trim();
  return (
    <View style={styles.bar}>
      {context ? (
        <Text numberOfLines={1} style={styles.context}>{context}</Text>
      ) : (
        <View style={styles.spacer} />
      )}
      {context ? (
        <View style={styles.arrows}>
          <AccessoryArrow
            direction="up"
            disabled={!command.onUp}
            onPress={() => command.onUp?.()}
          />
          <AccessoryArrow
            direction="down"
            disabled={!command.onDown}
            onPress={() => command.onDown?.()}
          />
        </View>
      ) : null}
      <Pressable
        accessibilityHint={label === "Next" ? "Move to the next field" : "Dismiss the keyboard"}
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => {
          const current = keyboardAccessorySnapshot();
          runKeyboardAccessory();
          if (current.label !== "Next") Keyboard.dismiss();
        }}
        style={(state) => [styles.action, state.pressed && styles.actionPressed, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </View>
  );
}

function AccessoryArrow({
  direction,
  disabled,
  onPress,
}: {
  direction: "down" | "up";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={direction === "up" ? "Previous field" : "Next field"}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        styles.arrow,
        state.pressed && !disabled && styles.actionPressed,
        webFocusRing(pressableFocused(state)),
      ]}
    >
      <Chevron color={disabled ? colors.disabledText : colors.ink} direction={direction} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: size.hit,
    paddingHorizontal: spacing.sm,
  },
  context: {
    color: colors.muted,
    flex: 1,
    flexShrink: 1,
    ...type.label,
  },
  spacer: {
    flex: 1,
  },
  arrows: {
    flexDirection: "row",
  },
  arrow: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  action: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: size.hit,
    paddingHorizontal: spacing.lg,
  },
  actionPressed: {
    backgroundColor: colors.brandTint,
  },
  actionLabel: {
    color: colors.brand,
    fontFamily: fonts.extrabold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
});
