import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CommunityReactionSummary, WorkoutFeedItem } from "@repin/types";

import { colors, fonts, radii, spacing } from "./theme";
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
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(44)).current;
  const closing = useRef(false);
  const useNativeDriver = Platform.OS !== "web";
  const panelHeight = useMemo(
    () => Math.min(viewportHeight * 0.9, Math.max(0, viewportHeight - insets.top - spacing.md)),
    [insets.top, viewportHeight],
  );

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    panelOpacity.setValue(0.96);
    panelTranslateY.setValue(44);
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
      Animated.timing(panelTranslateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver,
      }),
    ]).start();
  }, [backdropOpacity, panelOpacity, panelTranslateY, useNativeDriver, visible]);

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
        toValue: 0.96,
        useNativeDriver,
      }),
      Animated.timing(panelTranslateY, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
        toValue: 44,
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
      <View accessibilityViewIsModal style={styles.overlay}>
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
            {
              height: panelHeight,
              opacity: panelOpacity,
              transform: [{ translateY: panelTranslateY }],
            },
          ]}
        >
          <View style={styles.handle} />
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xxl },
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={[styles.scroller, webScrollerStyle]}
          >
            {groupId && sessionId ? (
              <WorkoutDetailView
                closeAction={<ModalCloseButton onPress={close} />}
                groupId={groupId}
                seedWorkout={initialWorkout ?? undefined}
                onCommentCountChange={onCommentCountChange}
                onReactionSummaryChange={onReactionSummaryChange}
                presentation="community-modal"
                sessionId={sessionId}
              />
            ) : null}
          </ScrollView>
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
      <Text style={styles.closeText}>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(34,34,34,0.28)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: "hidden" },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radii.pill, height: 4, marginTop: spacing.md, width: 38 },
  closeButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: 36, justifyContent: "center", width: 36 },
  closeText: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 26, lineHeight: 29, marginTop: -2 },
  pressed: { opacity: 0.66 },
  scroller: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
});
