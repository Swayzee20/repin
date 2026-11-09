import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  acquireOverlay,
  occupancyForIosNativeDismiss,
  occupancyForVisible,
  overlayHiddenStrategy,
  releaseOverlay,
} from "./overlay-occupancy";

export function useOverlayOccupancy(visible: boolean, onHidden?: () => void) {
  const reactId = useId();
  const id = `overlay:${reactId}`;
  const presented = useRef(false);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  const release = useCallback(() => {
    presented.current = false;
    releaseOverlay(id);
  }, [id]);

  useLayoutEffect(() => {
    const becameHidden = presented.current && !visible;
    const next = occupancyForVisible(visible, platform);
    presented.current = next.presented;
    if (next.acquire) acquireOverlay(id);
    if (next.release) releaseOverlay(id);
    if (becameHidden && overlayHiddenStrategy(platform) === "visibleFalse") {
      onHiddenRef.current?.();
    }
  }, [id, platform, visible]);

  const onNativeDismiss = useCallback(() => {
    if (platform !== "ios") return;
    if (occupancyForIosNativeDismiss(presented.current).release) release();
    if (!presented.current) onHiddenRef.current?.();
  }, [platform, release]);

  useEffect(() => () => {
    releaseOverlay(id);
  }, [id]);

  return { onNativeDismiss };
}
