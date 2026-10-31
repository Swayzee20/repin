import type { WorkoutType } from "@repin/types";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron, Icon } from "./icons";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, controls, elevation, fonts, radii, size, spacing, type } from "./theme";

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
    <View style={styles.grid}>
      {workoutTypeOptions.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={(state) => [
              styles.gridOption,
              (selected || state.pressed) && styles.gridOptionSelected,
              webFocusRing(pressableFocused(state)),
            ]}
          >
            <View style={styles.gridLabel}>
              <Text style={[styles.gridOptionText, selected && styles.gridOptionTextSelected]}>{option.label}</Text>
              {selected ? <Icon color={colors.brand} name="checkmark" size={size.icon.sm} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WorkoutTypeSelector({
  compact = false,
  elevated = false,
  onChange,
  value,
}: {
  compact?: boolean;
  elevated?: boolean;
  onChange: (value: WorkoutType) => void;
  value: WorkoutType | null;
}) {
  const [visible, setVisible] = useState(false);
  const dismiss = () => setVisible(false);

  return (
    <>
      <Pressable
        accessibilityHint="Opens workout type options"
        accessibilityLabel={value ? `Workout type, ${workoutTypeLabels[value]}` : "Select workout type"}
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={(state) => [
          styles.selector,
          compact && styles.selectorCompact,
          elevated && styles.selectorElevated,
          state.pressed && styles.selectorPressed,
          webFocusRing(pressableFocused(state)),
        ]}
      >
        <Text style={[styles.selectorText, !value && styles.placeholder]}>
          {value ? workoutTypeLabels[value] : "Select workout type"}
        </Text>
        <Chevron direction="down" />
      </Pressable>

      <BottomSheet closeLabel="Close workout type options" onDismiss={dismiss} title="Select workout type" visible={visible}>
        {(close) => (
          <View style={styles.options}>
            {workoutTypeOptions.map((option) => {
              const selected = value === option.value;
              return (
                <SheetRow
                  accessibilityLabel={option.label}
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    close();
                  }}
                  selected={selected}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                  {selected ? <Icon color={colors.brand} name="checkmark" /> : null}
                </SheetRow>
              );
            })}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    minHeight: controls.inputHeight,
    paddingHorizontal: spacing.lg,
  },
  selectorText: { ...type.bodyMedium, color: colors.ink, flex: 1 },
  selectorCompact: { borderRadius: radii.md, minHeight: size.control, paddingHorizontal: spacing.md },
  selectorElevated: { boxShadow: elevation.glass },
  selectorPressed: { backgroundColor: colors.selection },
  placeholder: { color: colors.muted },
  options: { marginTop: spacing.sm },
  optionText: { ...type.bodyMedium, color: colors.inkSoft, flex: 1 },
  optionTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  gridOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: controls.inputHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  gridOptionSelected: { backgroundColor: colors.selection, borderColor: colors.selection },
  gridLabel: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  gridOptionText: { ...type.bodySmall, color: colors.inkSoft, fontFamily: fonts.medium, textAlign: "center" },
  gridOptionTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
});
