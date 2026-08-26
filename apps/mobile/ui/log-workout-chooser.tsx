import { Feather } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radii, spacing, type } from "./theme";

const workoutLogOptions = [
  {
    key: "quick",
    icon: "zap",
    title: "Quick Log",
    description: "Fast check-in with optional details",
  },
  {
    key: "detailed",
    icon: "clipboard",
    title: "Detailed Workout",
    description: "For better tracking of exercises and stats",
  },
] as const;

export function LogWorkoutChooser({
  onDetailedWorkout,
  onDismiss,
  onQuickLog,
  visible,
}: {
  onDetailedWorkout: () => void;
  onDismiss: () => void;
  onQuickLog: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(360)).current;
  const closing = useRef(false);
  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(360);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver,
      }),
    ]).start();
  }, [backdropOpacity, sheetTranslateY, useNativeDriver, visible]);

  const close = (afterClose: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
        toValue: 360,
        useNativeDriver,
      }),
    ]).start(afterClose);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={() => close(onDismiss)}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable accessibilityLabel="Close workout options" accessibilityRole="button" onPress={() => close(onDismiss)} style={styles.backdropPressable} />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Check in</Text>
          <View style={styles.options}>
            {workoutLogOptions.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.key}
                onPress={() => close(option.key === "quick" ? onQuickLog : onDetailedWorkout)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <View style={styles.optionIcon}>
                  <Feather color={colors.muted} name={option.icon} size={20} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => close(onDismiss)} style={({ pressed }) => [styles.cancel, pressed && styles.optionPressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(34,34,34,0.28)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radii.pill, height: 4, marginBottom: spacing.lg, width: 38 },
  title: { color: colors.ink, ...type.title },
  options: { marginTop: spacing.lg },
  option: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 72, paddingVertical: spacing.md },
  optionPressed: { opacity: 0.66 },
  optionIcon: { alignItems: "center", justifyContent: "center", marginRight: spacing.md, width: 28 },
  optionCopy: { flex: 1, paddingRight: spacing.lg },
  optionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  optionDescription: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  chevron: { color: colors.brand, fontFamily: fonts.medium, fontSize: 28 },
  cancel: { alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: spacing.sm },
  cancelText: { color: colors.brand, ...type.label },
});
