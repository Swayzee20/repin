import { requireOptionalNativeModule } from "expo";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

import {
  createStripStore,
  edgeResolved,
  stripPresent,
  type StatusBarModule,
  type VerticalBarEdge,
} from "./vertical-bar-edge-store";

export type { VerticalBarEdge } from "./vertical-bar-edge-store";
export { edgeResolved, stripPresent };

/**
 * The edge of the iPhone Duo side strip, or null when there is no strip.
 *
 * One store for the whole app, read through `useSyncExternalStore`. A per-hook
 * subscription stays null when it mounts after expo-status-bar's single
 * OnStartObserving emission (listener count 0 → 1).
 *
 * Do not call `getVerticalBarEdge()` / `StatusBar.getVerticalBarEdgeIOS()`. That
 * synchronous Expo Function hops to the main thread with `dispatch_sync`. A fold
 * runs JS from the main thread's event beat (`executeNowOnTheSameThread`), so the
 * hop deadlocks (0x8BADF00D).
 */
const statusBar: StatusBarModule | null = requireOptionalNativeModule("ExpoStatusBar");

const store = createStripStore({
  appState: AppState,
  os: Platform.OS,
  statusBar,
  version: Platform.Version,
});

function subscribe(listener: () => void) {
  return store.subscribe(listener);
}

export function useVerticalBarEdge(): VerticalBarEdge | null {
  return useSyncExternalStore(
    subscribe,
    () => store.getState().edge,
    () => store.getState().edge,
  );
}

export function useStripPresent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => stripPresent(store.getState()),
    () => stripPresent(store.getState()),
  );
}

export function useEdgeResolved(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => edgeResolved(store.getState()),
    () => edgeResolved(store.getState()),
  );
}
