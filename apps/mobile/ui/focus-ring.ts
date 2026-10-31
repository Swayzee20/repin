import { Platform, type ViewStyle } from "react-native";

import { colors } from "./theme";

let keyboard = false;
let listening = false;

function ensureFocusModality() {
  if (listening || Platform.OS !== "web" || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Tab") keyboard = true;
  });
  window.addEventListener("mousedown", () => {
    keyboard = false;
  });
  window.addEventListener("touchstart", () => {
    keyboard = false;
  });
}

ensureFocusModality();

export function pressableFocused(state: object) {
  return "focused" in state && Boolean((state as { focused?: boolean }).focused);
}

/** 2pt brand ring for keyboard focus on web. Pointer focus does not draw it. */
export function webFocusRing(focused: boolean): ViewStyle | null {
  ensureFocusModality();
  if (Platform.OS !== "web" || !focused || !keyboard) return null;
  return {
    outlineColor: colors.brand,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 2,
  };
}
