import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  acquireOverlay,
  occupancyForIosNativeDismiss,
  occupancyForVisible,
  releaseOverlay,
} from "./overlay-occupancy";

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
    const next = occupancyForVisible(visible, platform);
    presented.current = next.presented;
    if (next.acquire) acquireOverlay(id);
    if (next.release) releaseOverlay(id);
  }, [id, platform, visible]);

  const onNativeDismiss = useCallback(() => {
    if (platform !== "ios") return;
    if (!occupancyForIosNativeDismiss(presented.current).release) return;
    release();
  }, [platform, release]);

  useEffect(() => () => {
    releaseOverlay(id);
  }, [id]);

  return { onNativeDismiss };
}
