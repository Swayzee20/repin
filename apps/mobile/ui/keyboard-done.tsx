import { useEffect, useState, useSyncExternalStore } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";

import { KeyboardAccessoryBar } from "./keyboard-accessory-bar";
import {
  keyboardAccessorySnapshot,
  subscribeKeyboardAccessory,
} from "./keyboard-accessory";
import { showsAndroidKeyboardAccessory } from "./strength-form-state";

/** Android has no InputAccessoryView, so strength number fields get a custom bar. */
export function KeyboardDoneAccessory() {
  const command = useSyncExternalStore(
    subscribeKeyboardAccessory,
    keyboardAccessorySnapshot,
    keyboardAccessorySnapshot,
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS !== "android" || !showsAndroidKeyboardAccessory(command.context, keyboardVisible)) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <KeyboardAccessoryBar command={command} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
});
