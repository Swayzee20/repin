import { colors, size } from "./theme";
import { stripPresent, type StripState } from "./vertical-bar-edge-store";

/**
 * Transparent native header for screens pushed on the root stack.
 *
 * iOS shows the system back button, with no title, so it can sit in the
 * Duo side strip. Android and web keep the root header hidden and the
 * in-content round back button.
 *
 * A transparent bar floats over the screen. A phone with no side strip needs
 * `pushedNavigationBarHeight` of extra padding below the safe area. The Duo
 * strip hosts the back button, so that case adds nothing.
 */
export const pushedNavigationBarHeight = size.hit;

/** Android and web keep the root stack header hidden. */
export function pushedNativeHeaderEnabled(platform: string): boolean {
  return platform === "ios";
}

/** The in-content round back button stays unless the native iOS one is showing. */
export function pushedShowsRoundBack(platform: string): boolean {
  return !pushedNativeHeaderEnabled(platform);
}

/**
 * Extra top padding beyond the safe area. `size.hit` when the iOS bar sits on
 * top of the screen, and nothing when the strip is present or this platform
 * keeps the round back button.
 */
export function pushedHeaderClearance(platform: string, strip: StripState): number {
  if (!pushedNativeHeaderEnabled(platform) || stripPresent(strip)) return 0;
  return pushedNavigationBarHeight;
}

export function pushedHeaderScreenOptions() {
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
