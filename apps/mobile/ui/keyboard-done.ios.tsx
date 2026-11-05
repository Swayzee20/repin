import { useSyncExternalStore } from "react";
import { InputAccessoryView } from "react-native";

import { KeyboardAccessoryBar } from "./keyboard-accessory-bar";
import {
  keyboardAccessorySnapshot,
  subscribeKeyboardAccessory,
} from "./keyboard-accessory";
import { keyboardDoneAccessoryId } from "./keyboard";

/** Bar above the iOS keyboard for multiline fields and number pads. */
export function KeyboardDoneAccessory() {
  const command = useSyncExternalStore(
    subscribeKeyboardAccessory,
    keyboardAccessorySnapshot,
    keyboardAccessorySnapshot,
  );
  return (
    <InputAccessoryView nativeID={keyboardDoneAccessoryId}>
      <KeyboardAccessoryBar command={command} />
    </InputAccessoryView>
  );
}
