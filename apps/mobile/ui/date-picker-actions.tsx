import { StyleSheet, View } from "react-native";

import { Button } from "./components";
import { dateActionHeight } from "./overlay-state";
import { spacing } from "./theme";

export function DatePickerActions({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.actions}>
      <View style={styles.action}>
        <Button onPress={onCancel} style={styles.button} variant="secondary">Cancel</Button>
      </View>
      <View style={styles.action}>
        <Button onPress={onDone} style={styles.button} variant="tonal">Done</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
  button: { height: dateActionHeight, minHeight: dateActionHeight },
});
