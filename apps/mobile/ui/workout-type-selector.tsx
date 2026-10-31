import type { WorkoutType } from "@repin/types";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChoiceTile, Picker } from "./form-fields";
import { Icon } from "./icons";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, fonts, spacing, type } from "./theme";

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
  const [visible, setVisible] = useState(false);
  const dismiss = () => setVisible(false);

  return (
    <>
      <Picker
        accessibilityHint="Opens workout type options"
        accessibilityLabel={value ? `Workout type, ${workoutTypeLabels[value]}` : "Select workout type"}
        containerStyle={styles.selector}
        onPress={() => setVisible(true)}
        value={value ? workoutTypeLabels[value] : null}
      />

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
  selector: { marginTop: spacing.md },
  options: { marginTop: spacing.sm },
  optionText: { ...type.bodyMedium, color: colors.inkSoft, flex: 1 },
  optionTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  gridOption: { flexBasis: "46%", flexGrow: 1 },
});
