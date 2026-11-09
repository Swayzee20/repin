import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { toastFrame, toastGutter } from "./overlay-state";
import { prCopy } from "./pr-copy";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import { useStripPresent } from "./vertical-bar-edge";

const undoToastMs = 6_000;

export function PrUndoToast({
  contained = false,
  gutter = toastGutter,
  onClear,
  onUndo,
  visible,
}: {
  /** Pane or modal host already sits in the content pane. Skip window insets. */
  contained?: boolean;
  gutter?: number;
  onClear: () => void;
  onUndo: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stripPresent = useStripPresent();
  const frame = toastFrame({ gutter, insets, stripPresent, width });
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

  const toast = (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        contained ? null : {
          bottom: frame.bottom,
          left: frame.left,
          position: "absolute",
          width: frame.width,
        },
      ]}
    >
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

  if (contained) return toast;

  return (
    <View pointerEvents="box-none" style={styles.windowDock}>
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  windowDock: { ...StyleSheet.absoluteFill, zIndex: 30 },
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
