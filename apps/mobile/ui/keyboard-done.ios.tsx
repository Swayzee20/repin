import { useSyncExternalStore } from "react";
import { InputAccessoryView, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import {
  keyboardAccessorySnapshot,
  runKeyboardAccessory,
  subscribeKeyboardAccessory,
} from "./keyboard-accessory";
import { keyboardDoneAccessoryId } from "./keyboard";
import { colors, radii, size, spacing, type } from "./theme";

/** Bar above the iOS keyboard for multiline fields and number pads. */
export function KeyboardDoneAccessory() {
  const command = useSyncExternalStore(
    subscribeKeyboardAccessory,
    keyboardAccessorySnapshot,
    keyboardAccessorySnapshot,
  );
  const label = command.label;
  return (
    <InputAccessoryView nativeID={keyboardDoneAccessoryId}>
      <View style={styles.bar}>
        <Pressable
          accessibilityHint={label === "Next" ? "Move to the next field" : "Dismiss the keyboard"}
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={() => {
            const current = keyboardAccessorySnapshot();
            runKeyboardAccessory();
            if (current.label !== "Next") Keyboard.dismiss();
          }}
          style={(state) => [styles.done, state.pressed && styles.donePressed]}
        >
          <Text style={styles.doneLabel}>{label}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.glassFill,
    borderTopColor: colors.glassEdge,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
    minHeight: size.hit,
    paddingHorizontal: spacing.sm,
  },
  done: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: size.hit,
    paddingHorizontal: spacing.lg,
  },
  donePressed: {
    backgroundColor: colors.brandTint,
  },
  doneLabel: {
    ...type.button,
    color: colors.brand,
  },
});
