import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { prCopy } from "./pr-copy";
import { colors, fonts, radii, size, spacing, type } from "./theme";

const undoToastMs = 6_000;

export function PrUndoToast({
  onClear,
  onUndo,
  visible,
}: {
  onClear: () => void;
  onUndo: () => void;
  visible: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const arm = useCallback((ms: number) => {
    clearTimer();
    if (!visible || ms <= 0) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      onClear();
    }, ms);
  }, [onClear, visible]);

  useEffect(() => {
    if (!visible) {
      clearTimer();
      return;
    }
    deadline.current = Date.now() + undoToastMs;
    arm(undoToastMs);
    return clearTimer;
  }, [arm, visible]);

  if (!visible) return null;

  return (
    <View accessibilityLiveRegion="polite" style={styles.toast}>
      <Text style={styles.message}>{prCopy.toast}</Text>
      <Pressable
        accessibilityLabel={prCopy.toastUndo}
        accessibilityRole="button"
        onBlur={() => arm(Math.max(0, deadline.current - Date.now()))}
        onFocus={clearTimer}
        onPress={() => {
          clearTimer();
          onUndo();
          onClear();
        }}
        style={(state) => [styles.action, state.pressed && styles.pressed, webFocusRing(pressableFocused(state))]}
      >
        <Text style={styles.actionLabel}>{prCopy.toastUndo}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.sm,
    height: size.primary,
    paddingHorizontal: spacing.md,
  },
  message: {
    color: colors.surface,
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  action: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    minWidth: size.hit,
  },
  actionLabel: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  pressed: {
    opacity: 0.72,
  },
});
