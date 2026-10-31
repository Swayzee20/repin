import { Platform } from "react-native";

/**
 * Dev-only web fixture for layout screenshots.
 * Call sites must also be written as `__DEV__ && isLayoutPreview()` so a
 * production bundle constant-folds the check and never reaches the stub.
 */
export function isLayoutPreview() {
  if (!__DEV__) return false;
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "layout";
}
