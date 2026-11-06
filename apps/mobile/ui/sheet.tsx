import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { useLayoutMode } from "./layout";
import { acquireOverlay, releaseOverlay } from "./overlay-occupancy";
import { pickerSheetTopGap, sheetDismissDistance, sheetFrame, sheetRowBackground, sheetRowMinHeight } from "./overlay-state";
import { RoundIconButton } from "./primitives";
import {
  initialSheetHideState,
  reduceSheetHide,
  type OverlayPlatform,
  type SheetHideEvent,
  type SheetHideState,
} from "./sheet-hide";
import { colors, elevation, radii, size, spacing, type } from "./theme";

export type SheetClose = (afterClose?: () => void) => void;

export function SheetHeader({
  closeLabel,
  onClose,
  style,
  title,
}: {
  closeLabel: string;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
}) {
  return (
    <View style={[styles.header, style]}>
      <RoundIconButton accessibilityLabel={closeLabel} kind="close" onPress={onClose} style={styles.close} />
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    </View>
  );
}

/** Lets the (+) toggle run this sheet's animated close while it is open. */
export function useRegisterSheetClose(
  closeRef: RefObject<SheetClose>,
  onRegisterClose: ((close: SheetClose | null) => void) | undefined,
  visible: boolean,
) {
  useEffect(() => {
    if (!onRegisterClose) return;
    if (!visible) {
      onRegisterClose(null);
      return;
    }
    onRegisterClose(() => {
      closeRef.current();
    });
    return () => onRegisterClose(null);
  }, [closeRef, onRegisterClose, visible]);
}

export function BottomSheet({
  children,
  closeLabel = "Close",
  full = false,
  onDismiss,
  onRegisterClose,
  title,
  topGap,
  visible,
}: {
  children: ReactNode | ((close: SheetClose) => ReactNode);
  closeLabel?: string;
  full?: boolean;
  onDismiss: () => void;
  onRegisterClose?: (close: SheetClose | null) => void;
  title: string;
  topGap?: number;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { split } = useLayoutMode();
  const frame = sheetFrame({
    height,
    insets,
    split,
    topGap: full ? topGap ?? pickerSheetTopGap : topGap,
    width,
  });
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(height)).current;
  const closeRef = useRef<SheetClose>(() => {});
  const overlayId = useRef(`sheet:${Math.random().toString(36).slice(2)}`).current;
  const hideState = useRef<SheetHideState>(initialSheetHideState);
  const pendingAfterClose = useRef<(() => void) | undefined>(undefined);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const hidePlatform: OverlayPlatform = Platform.OS === "ios"
    ? "ios"
    : Platform.OS === "android"
      ? "android"
      : "web";

  const applyHide = useCallback((event: SheetHideEvent) => {
    const result = reduceSheetHide(hideState.current, event);
    hideState.current = result.state;
    if (event.type === "presented") pendingAfterClose.current = undefined;
    for (const effect of result.effects) {
      if (effect === "acquireOverlay") acquireOverlay(overlayId);
      if (effect === "releaseOverlay") releaseOverlay(overlayId);
      if (effect === "requestVisibleFalse") onDismissRef.current();
      if (effect === "runAfterClose") {
        const afterClose = pendingAfterClose.current;
        pendingAfterClose.current = undefined;
        afterClose?.();
      }
    }
    return result;
  }, [overlayId]);

  const close = useCallback<SheetClose>((afterClose) => {
    const result = applyHide({
      hasAfterClose: typeof afterClose === "function",
      type: "closeRequested",
    });
    if (result.ignored) return;
    pendingAfterClose.current = afterClose;
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
      applyHide({ finished, type: "animationEnded" });
    });
  }, [applyHide, backdropOpacity, height, sheetTranslateY]);

  closeRef.current = close;
  useRegisterSheetClose(closeRef, onRegisterClose, visible);

  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) applyHide({ type: "presented" });
    wasVisible.current = visible;
    if (!visible) return;
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
  }, [applyHide, backdropOpacity, height, sheetTranslateY, visible]);

  useLayoutEffect(() => {
    if (visible) return;
    applyHide({ platform: hidePlatform, type: "visibleFalseCommitted" });
  }, [applyHide, hidePlatform, visible]);

  useEffect(() => () => {
    applyHide({ type: "unmounted" });
  }, [applyHide]);

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
      onDismiss={() => {
        applyHide({ platform: hidePlatform, type: "nativeDismissed" });
      }}
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
              height: full ? frame.maxHeight : undefined,
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
          {full ? <View style={styles.fullBody}>{content}</View> : content}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SheetRow({
  accessibilityLabel,
  children,
  divider = true,
  minHeight = sheetRowMinHeight,
  onPress,
  selected = false,
}: {
  accessibilityLabel?: string;
  children: ReactNode;
  divider?: boolean;
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
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
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
  fullBody: { flex: 1 },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    flexDirection: "row",
    gap: spacing.md,
  },
});
