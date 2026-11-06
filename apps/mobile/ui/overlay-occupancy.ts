const owners = new Set<string>();
const listeners = new Set<() => void>();

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
