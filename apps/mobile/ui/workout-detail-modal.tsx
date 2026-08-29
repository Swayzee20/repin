import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CommunityReactionSummary, WorkoutFeedItem } from "@repin/types";

import { colors, radii, spacing } from "./theme";
import { WorkoutDetailView } from "./workout-detail";

const webScrollerStyle = Platform.OS === "web"
  ? ({
      WebkitOverflowScrolling: "touch",
      overflowY: "auto",
      overscrollBehaviorY: "contain",
      touchAction: "pan-y",
    } as ViewStyle)
  : undefined;

export function WorkoutDetailModal({
  groupId,
  initialWorkout,
  onCommentCountChange,
  onDismiss,
  onReactionSummaryChange,
  sessionId,
  visible,
}: {
  groupId: string | null;
  initialWorkout?: WorkoutFeedItem | null;
  onCommentCountChange?: (sessionId: string, commentCount: number) => void;
  onDismiss: () => void;
  onReactionSummaryChange?: (sessionId: string, reactions: CommunityReactionSummary) => void;
  sessionId: string | null;
  visible: boolean;
}) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelScale = useRef(new Animated.Value(0.96)).current;
  const closing = useRef(false);
  const useNativeDriver = Platform.OS !== "web";
  const panelLayout = useMemo(
    () => ({
      maxHeight: Math.min(
        viewportHeight * 0.8,
        Math.max(0, viewportHeight - Math.max(insets.top, spacing.lg) - Math.max(insets.bottom, spacing.lg) - spacing.xl),
      ),
      width: Math.min(620, Math.max(0, viewportWidth - spacing.md * 2)),
    }),
    [insets.bottom, insets.top, viewportHeight, viewportWidth],
  );

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    panelOpacity.setValue(0);
    panelScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(panelOpacity, {
        duration: 210,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(panelScale, {
        duration: 210,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver,
      }),
    ]).start();
  }, [backdropOpacity, panelOpacity, panelScale, useNativeDriver, visible]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(panelOpacity, {
        duration: 180,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(panelScale, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
        toValue: 0.96,
        useNativeDriver,
      }),
    ]).start(onDismiss);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={close}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.overlay,
          Platform.OS === "web" ? { height: viewportHeight, flex: undefined } : null,
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable
          accessibilityLabel="Close workout details"
          accessibilityRole="button"
          onPress={close}
          style={styles.backdropPressable}
        />
        <Animated.View
          style={[
            styles.panel,
            panelLayout,
            {
              opacity: panelOpacity,
              transform: [{ scale: panelScale }],
            },
          ]}
        >
          <ModalCloseButton onPress={close} />
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xxl },
            ]}
            keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={[styles.scroller, webScrollerStyle]}
          >
            {groupId && sessionId ? (
              <WorkoutDetailView
                detailExpansionResetKey={`${sessionId}:${visible ? "open" : "closed"}`}
                detailPhotoMaxHeight={panelLayout.maxHeight * 0.4}
                groupId={groupId}
                seedWorkout={initialWorkout ?? undefined}
                onCommentCountChange={onCommentCountChange}
                onReactionSummaryChange={onReactionSummaryChange}
                presentation="community-modal"
                sessionId={sessionId}
              />
            ) : null}
          </ScrollView>
          <LinearGradient
            colors={[colors.surface, "rgba(255,255,255,0)"]}
            locations={[0, 1]}
            pointerEvents="none"
            style={styles.topScrollFade}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

function ModalCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Close workout details"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
    >
      <Feather color={colors.inkSoft} name="x" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: "center", flex: 1, justifyContent: "center", paddingVertical: spacing.lg },
  backdrop: { backgroundColor: "rgba(34,34,34,0.28)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  panel: { backgroundColor: colors.surface, borderColor: "rgba(34,34,34,0.16)", borderRadius: radii.xl, borderWidth: 1, overflow: "hidden" },
  closeButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, elevation: 5, height: 36, justifyContent: "center", position: "absolute", right: spacing.lg, top: spacing.lg, width: 36, zIndex: 20 },
  pressed: { opacity: 0.66 },
  scroller: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  topScrollFade: { height: 32, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
});
