import type { WorkoutType } from "@repin/types";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChoiceTile, Picker } from "./form-fields";
import { colors, elevation, fonts, radii, spacing, type } from "./theme";

export const workoutTypeOptions: { label: string; value: WorkoutType }[] = [
  { label: "Run", value: "run" },
  { label: "Walk", value: "walk" },
  { label: "Strength Training", value: "strength_training" },
  { label: "Powerlifting", value: "powerlifting" },
  { label: "HIIT", value: "hiit" },
  { label: "Functional Fitness", value: "functional_fitness" },
  { label: "Other", value: "other" },
];

export const workoutTypeLabels = Object.fromEntries(
  workoutTypeOptions.map((option) => [option.value, option.label]),
) as Record<WorkoutType, string>;

export function WorkoutTypeGrid({
  onChange,
  value,
}: {
  onChange: (value: WorkoutType) => void;
  value: WorkoutType | null;
}) {
  return (
    <View accessibilityLabel="Workout type" accessibilityRole="radiogroup" style={styles.grid}>
      {workoutTypeOptions.map((option) => (
        <ChoiceTile
          key={option.value}
          label={option.label}
          onPress={() => onChange(option.value)}
          selected={value === option.value}
          style={styles.gridOption}
        />
      ))}
    </View>
  );
}

export function WorkoutTypeSelector({
  onChange,
  value,
}: {
  onChange: (value: WorkoutType) => void;
  value: WorkoutType | null;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const dismiss = () => setVisible(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(windowHeight)).current;
  const closing = useRef(false);
  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(windowHeight);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out((value) => Easing.quad(value)),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 220,
        easing: Easing.out((value) => Easing.cubic(value)),
        toValue: 0,
        useNativeDriver,
      }),
    ]).start();
  }, [backdropOpacity, sheetTranslateY, useNativeDriver, visible, windowHeight]);

  const close = (afterClose: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in((value) => Easing.quad(value)),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 200,
        easing: Easing.in((value) => Easing.cubic(value)),
        toValue: windowHeight,
        useNativeDriver,
      }),
    ]).start(afterClose);
  };

  return (
    <>
      <Picker
        accessibilityHint="Opens workout type options"
        accessibilityLabel={value ? `Workout type, ${workoutTypeLabels[value]}` : "Select workout type"}
        containerStyle={styles.selector}
        onPress={() => setVisible(true)}
        value={value ? workoutTypeLabels[value] : null}
      />

      <Modal
        animationType="none"
        onRequestClose={() => close(dismiss)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={visible}
      >
        <View style={styles.overlay}>
          <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
          <Pressable accessibilityLabel="Close workout type options" accessibilityRole="button" onPress={() => close(dismiss)} style={styles.backdropPressable} />
          <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY: sheetTranslateY }] }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Select workout type</Text>
            <View style={styles.options}>
              {workoutTypeOptions.map((option) => {
                const selected = value === option.value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      close(dismiss);
                    }}
                    style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                    {selected ? <Text aria-hidden style={styles.checkmark}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" onPress={() => close(dismiss)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: { marginTop: spacing.md },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, boxShadow: elevation.e3, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radii.pill, height: 4, marginBottom: spacing.lg, width: 38 },
  title: { color: colors.ink, ...type.title },
  options: { marginTop: spacing.md },
  option: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 48, paddingHorizontal: spacing.sm },
  optionSelected: { backgroundColor: colors.surfaceMuted },
  optionText: { color: colors.inkSoft, ...type.bodyMedium },
  optionTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
  checkmark: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 17 },
  cancel: { alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: spacing.sm },
  cancelText: { color: colors.brand, ...type.label },
  pressed: { opacity: 0.7 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  gridOption: { flexBasis: "46%", flexGrow: 1 },
});
