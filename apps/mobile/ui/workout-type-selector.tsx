import { workoutTypeLabels, type WorkoutType } from "@repin/types";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChoiceTile, Picker } from "./form-fields";
import { Icon } from "./icons";
import {
  workoutTypeGridAlign,
  workoutTypeSelectorOptions,
  workoutTypeSheetAccessibilityLabel,
  workoutTypeSheetMeta,
} from "./logging-form-state";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, fonts, radii, spacing, type } from "./theme";

export { workoutTypeLabels, workoutTypeSelectorOptions as workoutTypeOptions };

export function WorkoutTypeGrid({
  onChange,
  value,
}: {
  onChange: (value: WorkoutType) => void;
  value: WorkoutType | null;
}) {
  return (
    <View accessibilityLabel="Workout type" accessibilityRole="radiogroup" style={styles.grid}>
      {workoutTypeSelectorOptions.map((option) => (
        <ChoiceTile
          align={workoutTypeGridAlign}
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
            {workoutTypeSelectorOptions.map((option) => {
              const selected = value === option.value;
              const meta = workoutTypeSheetMeta(option.value);
              return (
                <SheetRow
                  accessibilityLabel={workoutTypeSheetAccessibilityLabel(option.value)}
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    close();
                  }}
                  selected={selected}
                >
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                    {meta.subtitle ? <Text style={styles.optionSubtitle}>{meta.subtitle}</Text> : null}
                  </View>
                  {meta.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{meta.badge}</Text>
                    </View>
                  ) : null}
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
  optionCopy: { flex: 1, minWidth: 0 },
  optionText: { ...type.bodyMedium, color: colors.inkSoft },
  optionTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
  optionSubtitle: { ...type.bodySmall, color: colors.muted, marginTop: spacing.xs },
  badge: {
    backgroundColor: colors.brandTint,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    color: colors.brandPressed,
    fontFamily: fonts.bold,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  gridOption: { flexBasis: "46%", flexGrow: 1 },
});
