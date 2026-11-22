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
 * strip hosts the back button, so untitled screens add nothing.
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

/**
 * Titled pushed screens (Crew, Highlights, Activity). Duo still paints the
 * translucent native title over the content when the strip is present, so
 * these screens need `size.hit` there. Untitled pushed screens keep using
 * `pushedHeaderClearance` (0 on a strip). Do not add this on top of
 * clearance: that double-pads phones.
 *
 * `titledPushedHeaderClearance` uses this as the floor when the navigator
 * height is missing or shorter than today's 44.
 */
export function titledPushedHeaderInset(platform: string, strip: StripState): number {
  if (pushedNativeHeaderEnabled(platform) && stripPresent(strip)) {
    return pushedNavigationBarHeight;
  }
  return pushedHeaderClearance(platform, strip);
}

/** Upper bound on titled extra pad. Four hit targets, from existing tokens. */
export const titledPushedHeaderClearanceMax = pushedNavigationBarHeight * 4;

/**
 * Titled pushed screens. Extra pad below an already-applied SafeArea top, so
 * the total offset equals the navigator header height. Do not pass the raw
 * header height into a view that also has a top safe-area inset: that
 * double-counts the status bar.
 *
 * Missing, non-finite, or non-positive header height, and missing,
 * non-finite, or negative safeTop, fall back to `titledPushedHeaderInset`
 * (44 on iOS, 0 on Android/web). A measured safeTop of 0 is valid and is
 * not a fallback. A short measurement never goes below that floor. The
 * cap stops a bad native event from exploding the layout.
 */
export function titledPushedHeaderClearance({
  headerHeight,
  platform,
  safeTop,
  strip,
}: {
  headerHeight: number;
  platform: string;
  safeTop: number;
  strip: StripState;
}): number {
  const fallback = titledPushedHeaderInset(platform, strip);
  if (!pushedNativeHeaderEnabled(platform)) return fallback;
  if (!Number.isFinite(headerHeight) || headerHeight <= 0) return fallback;
  if (!Number.isFinite(safeTop) || safeTop < 0) return fallback;
  const extra = Math.max(0, headerHeight - safeTop);
  return Math.max(fallback, Math.min(extra, titledPushedHeaderClearanceMax));
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
