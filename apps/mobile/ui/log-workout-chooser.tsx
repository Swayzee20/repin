import { StyleSheet, Text, View } from "react-native";

import { Chevron, Icon, type IconName } from "./icons";
import { chooserRowMinHeight } from "./overlay-state";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, spacing, type } from "./theme";

const workoutLogOptions: readonly {
  description: string;
  icon: IconName;
  key: "quick" | "detailed";
  title: string;
}[] = [
  {
    description: "Rep in fast, add details if you want",
    icon: "bolt",
    key: "quick",
    title: "Quick Log",
  },
  {
    description: "For better tracking of exercises and stats",
    icon: "clipboard",
    key: "detailed",
    title: "Detailed Workout",
  },
];

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
  return (
    <BottomSheet closeLabel="Close workout options" onDismiss={onDismiss} title="Rep in" visible={visible}>
      {(close) => (
        <View style={styles.options}>
          {workoutLogOptions.map((option) => (
            <SheetRow
              accessibilityLabel={`${option.title}. ${option.description}`}
              key={option.key}
              minHeight={chooserRowMinHeight}
              onPress={() => close(option.key === "quick" ? onQuickLog : onDetailedWorkout)}
            >
              <Icon color={colors.muted} name={option.icon} />
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Chevron color={colors.brand} />
            </SheetRow>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: { marginTop: spacing.sm },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.ink, ...type.section },
  optionDescription: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
});
