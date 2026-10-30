import { Platform } from "react-native";

/** Dev-only web fixture for layout screenshots. Production bundles drop this. */
export function isLayoutPreview() {
  if (!__DEV__ || Platform.OS !== "web" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "layout";
}
