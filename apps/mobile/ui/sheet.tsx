import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { useLayoutMode } from "./layout";
import { sheetDismissDistance, sheetFrame, sheetRowBackground, sheetRowMinHeight } from "./overlay-state";
import { RoundIconButton } from "./primitives";
import { colors, elevation, radii, size, spacing, type } from "./theme";

export type SheetClose = (afterClose?: () => void) => void;

export function SheetHeader({
  closeLabel,
  onClose,
  title,
}: {
  closeLabel: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <View style={styles.header}>
      <RoundIconButton accessibilityLabel={closeLabel} kind="close" onPress={onClose} style={styles.close} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function BottomSheet({
  children,
  closeLabel = "Close",
  onDismiss,
  title,
  visible,
}: {
  children: ReactNode | ((close: SheetClose) => ReactNode);
  closeLabel?: string;
  onDismiss: () => void;
  title: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { split } = useLayoutMode();
  const frame = sheetFrame({ height, insets, split, width });
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(height)).current;
  const closing = useRef(false);
  const closeRef = useRef<SheetClose>(() => {});

  const close = useCallback<SheetClose>((afterClose) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in((value) => Easing.quad(value)),
        toValue: 0,
        useNativeDriver: false,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 200,
        easing: Easing.in((value) => Easing.cubic(value)),
        toValue: height,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (afterClose) afterClose();
      else onDismiss();
    });
  }, [backdropOpacity, height, onDismiss, sheetTranslateY]);

  closeRef.current = close;

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(height);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out((value) => Easing.quad(value)),
        toValue: 1,
        useNativeDriver: false,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 220,
        easing: Easing.out((value) => Easing.cubic(value)),
        toValue: 0,
        useNativeDriver: false,
      }),
    ]).start();
  }, [backdropOpacity, height, sheetTranslateY, visible]);

  const dragOrigin = useRef(0);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      sheetTranslateY.stopAnimation((value) => {
        dragOrigin.current = value;
      });
    },
    onPanResponderMove: (_, gesture) => {
      sheetTranslateY.setValue(Math.max(0, dragOrigin.current + gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > sheetDismissDistance || gesture.vy > 0.75) closeRef.current();
      else {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: false,
        }).start();
      }
    },
  })).current;

  const content = typeof children === "function" ? children(close) : children;

  return (
    <Modal
      animationType="none"
      onRequestClose={() => close()}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable accessibilityLabel={closeLabel} accessibilityRole="button" onPress={() => close()} style={styles.backdropPressable} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              left: frame.left,
              maxHeight: frame.maxHeight,
              paddingBottom: Math.max(frame.bottomInset, spacing.lg),
              transform: [{ translateY: sheetTranslateY }],
              width: frame.width,
            },
          ]}
        >
          <View {...pan.panHandlers}>
            <View style={styles.grabber} />
            <SheetHeader closeLabel={closeLabel} onClose={() => close()} title={title} />
          </View>
          {content}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SheetRow({
  accessibilityLabel,
  children,
  minHeight = sheetRowMinHeight,
  onPress,
  selected = false,
}: {
  accessibilityLabel?: string;
  children: ReactNode;
  minHeight?: number;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [
        styles.row,
        {
          backgroundColor: sheetRowBackground(selected, state.pressed),
          minHeight,
        },
        webFocusRing(pressableFocused(state)),
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    bottom: 0,
    boxShadow: elevation.e3,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    position: "absolute",
  },
  grabber: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radii.pill,
    height: spacing.xs,
    marginBottom: spacing.md,
    width: size.iconButton,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.sm,
    minHeight: sheetRowMinHeight,
  },
  title: { ...type.title, color: colors.ink, flex: 1 },
  close: { alignSelf: "center" },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
  },
});
