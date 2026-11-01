import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CommunityReactionSummary, WorkoutFeedItem } from "@repin/types";

import { CenteredCard } from "./layout";
import { RoundIconButton } from "./primitives";
import { colors, elevation, radii, size, spacing, type } from "./theme";
import { WorkoutDetailView, type WorkoutDetailFixture } from "./workout-detail";

export function WorkoutDetailModal({
  fixture = null,
  groupId,
  groupName = null,
  initialWorkout,
  onCommentCountChange,
  onDismiss,
  onReactionSummaryChange,
  sessionId,
  visible,
}: {
  fixture?: WorkoutDetailFixture | null;
  groupId: string | null;
  groupName?: string | null;
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
  const panelScale = useRef(new Animated.Value(0.96)).current;
  const closing = useRef(false);
  const useNativeDriver = Platform.OS !== "web";
  const panelMaxHeight = useMemo(
    () => Math.min(
      viewportHeight * 0.8,
      Math.max(0, viewportHeight - Math.max(insets.top, spacing.lg) - Math.max(insets.bottom, spacing.lg) - spacing.xl),
    ),
    [insets.bottom, insets.top, viewportHeight],
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
        easing: Easing.out((value) => Easing.quad(value)),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(panelOpacity, {
        duration: 210,
        easing: Easing.out((value) => Easing.quad(value)),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(panelScale, {
        duration: 210,
        easing: Easing.out((value) => Easing.cubic(value)),
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
        easing: Easing.in((value) => Easing.quad(value)),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(panelOpacity, {
        duration: 180,
        easing: Easing.in((value) => Easing.quad(value)),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(panelScale, {
        duration: 180,
        easing: Easing.in((value) => Easing.cubic(value)),
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
        <View accessibilityViewIsModal pointerEvents="box-none" style={styles.modalFocus}>
          <CenteredCard>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={[styles.keyboard, { maxHeight: panelMaxHeight }]}
            >
              <Animated.View
                style={[
                  styles.panel,
                  {
                    maxHeight: panelMaxHeight,
                    opacity: panelOpacity,
                    transform: [{ scale: panelScale }],
                    width: "100%",
                  },
                ]}
              >
                <View style={styles.panelClip}>
                  <View style={styles.header}>
                    <RoundIconButton accessibilityLabel="Close workout details" kind="close" onPress={close} style={styles.headerClose} />
                    <View style={styles.headerCopy}>
                      <Text accessibilityRole="header" style={styles.headerTitle}>Post</Text>
                      {groupName ? (
                        <Text numberOfLines={1} style={styles.headerFrom}>from {groupName}</Text>
                      ) : null}
                    </View>
                  </View>
                  {groupId && sessionId ? (
                    <WorkoutDetailView
                      detailExpansionResetKey={`${sessionId}:${visible ? "open" : "closed"}`}
                      detailPhotoMaxHeight={panelMaxHeight * 0.4}
                      fixture={fixture}
                      groupId={groupId}
                      seedWorkout={initialWorkout ?? undefined}
                      onCommentCountChange={onCommentCountChange}
                      onReactionSummaryChange={onReactionSummaryChange}
                      presentation="community-modal"
                      sessionId={sessionId}
                    />
                  ) : null}
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          </CenteredCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: "center", flex: 1, justifyContent: "center", paddingVertical: spacing.lg },
  modalFocus: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  keyboard: { width: "100%" },
  panel: { backgroundColor: colors.surface, borderColor: colors.overlaySoft, borderRadius: radii.lg, borderWidth: 1, boxShadow: elevation.e3 },
  // eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size
  panelClip: { borderRadius: radii.lg, flexShrink: 1, minHeight: 0, overflow: "hidden" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: size.hit + spacing.md,
    paddingHorizontal: spacing.lg,
  },
  headerClose: { alignSelf: "center" },
  headerCopy: { alignItems: "baseline", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0 },
  headerTitle: { color: colors.ink, ...type.heading },
  headerFrom: { color: colors.muted, flexShrink: 1, ...type.bodySmall },
});
