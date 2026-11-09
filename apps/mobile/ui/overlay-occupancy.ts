import type { OverlayPlatform } from "./sheet-hide";

const owners = new Set<string>();
const listeners = new Set<() => void>();

export function occupancyForVisible(visible: boolean, platform: OverlayPlatform) {
  if (visible) return { acquire: true, presented: true, release: false };
  if (platform === "ios") return { acquire: false, presented: false, release: false };
  return { acquire: false, presented: false, release: true };
}

export function occupancyForIosNativeDismiss(presented: boolean) {
  return { release: !presented };
}

/** iOS Modal onDismiss runs after hide; Android/web hide is done when visible=false. */
export function overlayHiddenStrategy(platform: OverlayPlatform) {
  return platform === "ios" ? "nativeDismiss" : "visibleFalse";
}

export function acquireOverlay(id: string) {
  if (owners.has(id)) return;
  owners.add(id);
  emit();
}

export function releaseOverlay(id: string) {
  if (!owners.delete(id)) return;
  emit();
}

export function overlayCount() {
  return owners.size;
}

export function subscribeOverlayCount(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetOverlayOccupancyForTests() {
  owners.clear();
}

function emit() {
  for (const listener of listeners) listener();
}
