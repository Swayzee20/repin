import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";

import { acquireOverlay, releaseOverlay } from "./overlay-occupancy";

export function useOverlayOccupancy(visible: boolean) {
  const reactId = useId();
  const id = `overlay:${reactId}`;
  const presented = useRef(false);
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  const release = useCallback(() => {
    presented.current = false;
    releaseOverlay(id);
  }, [id]);

  useLayoutEffect(() => {
    if (visible) {
      acquireOverlay(id);
      presented.current = true;
      return;
    }
    if (platform === "ios") return;
    release();
  }, [id, platform, release, visible]);

  const onNativeDismiss = useCallback(() => {
    if (platform !== "ios") return;
    release();
  }, [platform, release]);

  useEffect(() => () => {
    releaseOverlay(id);
  }, [id]);

  return { onNativeDismiss };
}
