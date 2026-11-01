import { colors, size } from "./theme";
import { stripPresent, type StripState } from "./vertical-bar-edge-store";

/**
 * Height of the bar below the safe-area top. A transparent header floats over
 * the screen, so a phone with no side strip needs this much extra padding.
 */
export const settingsNavigationBarHeight = size.hit;

/** Android and web keep the root stack header hidden. */
export function settingsNativeHeaderEnabled(platform: string): boolean {
  return platform === "ios";
}

/** The in-content round back button stays unless the native iOS one is showing. */
export function settingsShowsRoundBack(platform: string): boolean {
  return !settingsNativeHeaderEnabled(platform);
}

/**
 * Extra top padding beyond the safe area. The Duo strip hosts the back button
 * and the toolbar action, so that case adds nothing.
 */
export function settingsHeaderClearance(platform: string, strip: StripState): number {
  if (!settingsNativeHeaderEnabled(platform) || stripPresent(strip)) return 0;
  return settingsNavigationBarHeight;
}

export function settingsHeaderScreenOptions() {
  return {
    headerBackButtonDisplayMode: "minimal" as const,
    headerBackTitle: "",
    headerBackVisible: true,
    headerLargeTitle: false,
    headerLargeTitleEnabled: false,
    headerShadowVisible: false,
    headerShown: true,
    headerTintColor: colors.ink,
    headerTitle: "",
    headerTransparent: true,
    title: "",
  };
}
