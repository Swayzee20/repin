import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useLayoutMode } from "./layout";
import {
  chooserMeasuredAnchor,
  chooserMotion,
  chooserPanel,
  chooserPanelFrame,
  chooserShowsPlusAnchor,
  chooserSwipeActivation,
  chooserSwipeShouldDismiss,
  type ChooserPanelEdge,
  type ChooserPanelFrame,
} from "./overlay-state";
import { SheetHeader, useRegisterSheetClose, type SheetClose } from "./sheet";
import { colors, elevation, radii, size, spacing } from "./theme";

const panelBorderWidth = 1;

export function SidePanel({
  children,
  closeLabel,
  edge,
  onDismiss,
  onRegisterClose,
  title,
  visible,
}: {
  children: ReactNode | ((close: SheetClose) => ReactNode);
  closeLabel: string;
  edge: ChooserPanelEdge;
  onDismiss: () => void;
  onRegisterClose?: (close: SheetClose | null) => void;
  title: string;
  visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const { split } = useLayoutMode();
  const anchor = chooserMeasuredAnchor(split.foldActive);
  const frame = chooserPanelFrame({ W: width, edge, pillTop: anchor.pillTop, py: anchor.py });
  const reduceMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const panelOpacity = useSharedValue(0);
  const scrimOpacity = useSharedValue(0);
  const closing = useRef(false);
  const didFinishClose = useRef(false);
  const closeRef = useRef<SheetClose>(() => {});
  const frameRef = useRef(frame);
  const reduceMotionRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const pendingAfterClose = useRef<(() => void) | undefined>(undefined);
  const wasVisible = useRef(false);
  const openKey = useRef<string | null>(null);
  frameRef.current = frame;
  reduceMotionRef.current = reduceMotion === true;
  onDismissRef.current = onDismiss;

  const frameKey = `${width}:${split.foldActive ? "unfolded" : "folded"}:${edge}`;
  const rowsMaxHeight = Math.max(
    0,
    frame.maxHeight - panelBorderWidth * 2 - chooserPanel.padding.top - chooserPanel.padding.bottom - size.hit - spacing.sm,
  );

  const finishClose = useCallback(() => {
    if (didFinishClose.current) return;
    didFinishClose.current = true;
    const afterClose = pendingAfterClose.current;
    pendingAfterClose.current = undefined;
    if (afterClose) afterClose();
    else onDismissRef.current();
  }, []);

  const close = useCallback<SheetClose>((afterClose) => {
    if (closing.current) return;
    closing.current = true;
    didFinishClose.current = false;
    pendingAfterClose.current = afterClose;
    const reduced = reduceMotionRef.current;
    const offscreen = frameRef.current.offscreenX;
    scrimOpacity.value = withTiming(
      0,
      { duration: chooserMotion.scrimCloseMs, easing: Easing.in(Easing.quad) },
      (finished) => {
        "worklet";
        if (reduced && finished) runOnJS(finishClose)();
      },
    );
    if (reduced) {
      translateX.value = 0;
      panelOpacity.value = withTiming(0, { duration: chooserMotion.reduceCloseMs });
      return;
    }
    panelOpacity.value = withTiming(0, { duration: chooserMotion.closeMs });
    translateX.value = withTiming(
      offscreen,
      { duration: chooserMotion.closeMs, easing: Easing.in(Easing.cubic) },
      (finished) => {
        "worklet";
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [finishClose, panelOpacity, scrimOpacity, translateX]);

  closeRef.current = close;
  useRegisterSheetClose(closeRef, onRegisterClose, visible);

  useEffect(() => {
    const becameVisible = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!becameVisible) return;
    closing.current = false;
    didFinishClose.current = false;
    const reduced = reduceMotion === true;
    const offscreen = frameRef.current.offscreenX;
    if (reduced) {
      translateX.value = 0;
      panelOpacity.value = 0;
      panelOpacity.value = withTiming(1, { duration: chooserMotion.reduceOpenMs });
    } else {
      translateX.value = offscreen;
      panelOpacity.value = chooserMotion.openOpacityFrom;
      translateX.value = withSpring(0, chooserMotion.openSpring);
      panelOpacity.value = withTiming(1, {
        duration: chooserMotion.openOpacityMs,
        easing: Easing.out(Easing.quad),
      });
    }
    scrimOpacity.value = withTiming(1, {
      duration: chooserMotion.scrimOpenMs,
      easing: Easing.out(Easing.quad),
    });
  }, [panelOpacity, reduceMotion, scrimOpacity, translateX, visible]);

  useEffect(() => {
    if (!visible) {
      openKey.current = null;
      return;
    }
    if (openKey.current === null) {
      openKey.current = frameKey;
      return;
    }
    if (openKey.current !== frameKey) {
      openKey.current = null;
      cancelAnimation(translateX);
      cancelAnimation(panelOpacity);
      cancelAnimation(scrimOpacity);
      panelOpacity.value = 0;
      scrimOpacity.value = 0;
      onDismissRef.current();
    }
  }, [frameKey, panelOpacity, scrimOpacity, translateX, visible]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      const toward = gesture.dx * frameRef.current.dismissDirection;
      return toward > chooserSwipeActivation && Math.abs(gesture.dx) > Math.abs(gesture.dy);
    },
    onPanResponderGrant: () => {
      cancelAnimation(translateX);
    },
    onPanResponderMove: (_, gesture) => {
      if (reduceMotionRef.current) return;
      const direction = frameRef.current.dismissDirection;
      const toward = Math.max(0, gesture.dx * direction);
      translateX.value = direction * toward;
    },
    onPanResponderRelease: (_, gesture) => {
      const current = frameRef.current;
      const toward = gesture.dx * current.dismissDirection;
      const velocity = gesture.vx * current.dismissDirection;
      if (chooserSwipeShouldDismiss({ distance: toward, velocity, width: current.width })) {
        closeRef.current();
        return;
      }
      if (reduceMotionRef.current) return;
      translateX.value = withSpring(0, chooserMotion.openSpring);
    },
    onPanResponderTerminate: () => {
      if (reduceMotionRef.current) return;
      translateX.value = withSpring(0, chooserMotion.openSpring);
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
    transform: [{ translateX: translateX.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  const content = typeof children === "function" ? children(close) : children;
  const caretAlongLeading = frame.dismissDirection < 0;

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
        <Animated.View pointerEvents="none" style={[styles.backdrop, scrimStyle]} />
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={() => close()}
          style={styles.backdropPressable}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={() => close()}
          pointerEvents="box-none"
          style={styles.focus}
        >
          <Animated.View
            {...pan.panHandlers}
            style={[
              styles.panel,
              panelStyle,
              {
                left: frame.left,
                maxHeight: frame.maxHeight,
                top: frame.top,
                width: frame.width,
              },
            ]}
          >
            <View style={[styles.surface, { maxHeight: frame.maxHeight }]}>
              <SheetHeader closeLabel={closeLabel} onClose={() => close()} style={styles.header} title={title} />
              <ScrollView bounces={false} style={[styles.rows, { maxHeight: rowsMaxHeight }]}>
                {content}
              </ScrollView>
            </View>
            <ChooserCaret frame={frame} leading={caretAlongLeading} />
          </Animated.View>
          {chooserShowsPlusAnchor ? (
            <PlusAnchor closeLabel={closeLabel} frame={frame} onPress={() => close()} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PlusAnchor({
  closeLabel,
  frame,
  onPress,
}: {
  closeLabel: string;
  frame: ChooserPanelFrame;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={closeLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded: true }}
      onPress={onPress}
      style={[
        styles.plus,
        {
          left: frame.plusCentre.x - chooserPanel.plusRadius,
          top: frame.plusCentre.y - chooserPanel.plusRadius,
        },
      ]}
    >
      {/*
        Native prominent (+) tints brand toward the §2.0 sample. That sample is
        not a token, so this stand-in uses brand. QA-C2 compares it on device.
      */}
      <SymbolView
        name="plus"
        resizeMode="scaleAspectFit"
        size={size.icon.md}
        style={styles.plusIcon}
        tintColor={colors.surface}
        weight="semibold"
      />
    </Pressable>
  );
}

function ChooserCaret({ frame, leading }: { frame: ChooserPanelFrame; leading: boolean }) {
  const caret = chooserPanel.caret;
  const overlap = panelBorderWidth;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.caret,
        leading ? { left: -(caret.width - overlap), transform: [{ scaleX: -1 }] } : { right: -(caret.width - overlap) },
        { top: frame.caretOffsetY },
      ]}
    >
      <View
        style={{
          borderBottomColor: "transparent",
          borderBottomWidth: caret.height / 2,
          borderLeftColor: colors.border,
          borderLeftWidth: caret.width,
          borderTopColor: "transparent",
          borderTopWidth: caret.height / 2,
          height: 0,
          width: 0,
        }}
      />
      <View
        style={{
          borderBottomColor: "transparent",
          borderBottomWidth: (caret.height - overlap * 2) / 2,
          borderLeftColor: colors.surface,
          borderLeftWidth: caret.width - overlap,
          borderTopColor: "transparent",
          borderTopWidth: (caret.height - overlap * 2) / 2,
          height: 0,
          left: 0,
          position: "absolute",
          top: overlap,
          width: 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  focus: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  panel: { position: "absolute" },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: panelBorderWidth,
    boxShadow: elevation.e3,
    overflow: "hidden",
    paddingBottom: chooserPanel.padding.bottom,
    paddingHorizontal: chooserPanel.padding.horizontal,
    paddingTop: chooserPanel.padding.top,
  },
  header: { minHeight: size.hit },
  rows: { flexGrow: 0 },
  caret: { position: "absolute" },
  plus: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: size.control,
    justifyContent: "center",
    position: "absolute",
    width: size.control,
  },
  plusIcon: { height: size.icon.md, width: size.icon.md },
});
