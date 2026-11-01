import { Platform, StyleSheet, Text, View } from "react-native";

import { Chevron, Icon, type IconName } from "./icons";
import { useMainTabs } from "./main-tabs-context";
import { chooserRowMinHeight } from "./overlay-state";
import { BottomSheet, SheetRow, type SheetClose } from "./sheet";
import { SidePanel } from "./side-panel";
import { colors, spacing, type } from "./theme";
import { stripPresent, useStripState } from "./vertical-bar-edge";

const workoutLogOptions: readonly {
  description: string;
  icon: IconName;
  key: "quick" | "detailed";
  title: string;
}[] = [
  {
    description: "Log fast, add details if you want",
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
  const strip = useStripState();
  const { registerWorkoutChooserClose } = useMainTabs();
  const sidePanel = Platform.OS === "ios" && stripPresent(strip);
  const edge = strip.edge === "leading" ? "leading" : "trailing";
  const options = (close: SheetClose) => (
    <ChooserOptions
      close={close}
      omitLastDivider={sidePanel}
      onDetailedWorkout={onDetailedWorkout}
      onQuickLog={onQuickLog}
    />
  );

  if (sidePanel) {
    return (
      <SidePanel
        closeLabel="Close workout options"
        edge={edge}
        onDismiss={onDismiss}
        onRegisterClose={registerWorkoutChooserClose}
        title="Log a workout"
        visible={visible}
      >
        {options}
      </SidePanel>
    );
  }

  return (
    <BottomSheet
      closeLabel="Close workout options"
      onDismiss={onDismiss}
      onRegisterClose={registerWorkoutChooserClose}
      title="Log a workout"
      visible={visible}
    >
      {options}
    </BottomSheet>
  );
}

function ChooserOptions({
  close,
  omitLastDivider,
  onDetailedWorkout,
  onQuickLog,
}: {
  close: SheetClose;
  omitLastDivider: boolean;
  onDetailedWorkout: () => void;
  onQuickLog: () => void;
}) {
  return (
    <View style={styles.options}>
      {workoutLogOptions.map((option, index) => (
        <SheetRow
          accessibilityLabel={`${option.title}. ${option.description}`}
          divider={!omitLastDivider || index < workoutLogOptions.length - 1}
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
  );
}

const styles = StyleSheet.create({
  options: { marginTop: spacing.sm },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.ink, ...type.section },
  optionDescription: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
});
