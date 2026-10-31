import { size } from "./theme";
import { edgeResolved, stripPresent, type StripState } from "./vertical-bar-edge-store";

export type TabRootSlot = "hidden" | "strip" | "top-bar";

export type TabRootControl = "none" | "toolbar" | "header-button";

export type TabRootChrome = {
  headerShown: boolean;
  /**
   * Where the plus is placed. iOS moves the same toolbar button between the
   * strip and the top bar. Pending stays hidden so that button never flashes
   * in the top bar before the strip edge arrives.
   */
  slot: TabRootSlot;
  /**
   * One control. iOS keeps the locked Stack.Toolbar plus. Other platforms use
   * the 44pt header button. Android's toolbar path requires @expo/ui, which
   * this app does not ship.
   */
  control: TabRootControl;
};

export type TabRootChromeInput = {
  hasSelectedGroup: boolean;
  hasSession: boolean;
  platform: string;
};

/** Web and Android header plus. The iOS control is the system toolbar button. */
export const tabRootHeaderButtonDiameter = size.hit;

/** One web vector set, matching the native tab symbols: house, person.2, person.crop.circle. */
export const webTabIcons = {
  "(home)": "house",
  community: "person.2",
  profile: "person.crop.circle",
} as const;

export function webTabIconName(routeName: string): (typeof webTabIcons)[keyof typeof webTabIcons] {
  if (routeName === "(home)" || routeName === "community" || routeName === "profile") {
    return webTabIcons[routeName];
  }
  return webTabIcons["(home)"];
}

export function tabRootChrome(state: StripState, input: TabRootChromeInput): TabRootChrome {
  const headerShown = edgeResolved(state);
  const canRepIn = headerShown && input.hasSession && input.hasSelectedGroup;
  if (!canRepIn) {
    return { control: "none", headerShown, slot: "hidden" };
  }
  return {
    control: input.platform === "ios" ? "toolbar" : "header-button",
    headerShown,
    slot: stripPresent(state) ? "strip" : "top-bar",
  };
}
