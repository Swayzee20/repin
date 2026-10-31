import type { ReservedRegion } from "./reserved-regions-availability";

/**
 * Holds the latest reserved-region snapshot until a later turn applies it.
 * `push` never publishes. A second push before `flush` keeps only the newest
 * snapshot and tells the caller not to schedule another apply.
 */
export function createReservedRegionApplier() {
  let pending: readonly ReservedRegion[] = [];
  let scheduled = false;

  return {
    push(regions: readonly ReservedRegion[]) {
      pending = regions;
      if (scheduled) return false;
      scheduled = true;
      return true;
    },
    flush() {
      scheduled = false;
      return pending;
    },
  };
}

export function reservedRegionsEqual(
  left: readonly ReservedRegion[],
  right: readonly ReservedRegion[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const current = left[index];
    const next = right[index];
    if (!current || !next || current.kind !== next.kind) return false;
    if (
      current.frame.x !== next.frame.x ||
      current.frame.y !== next.frame.y ||
      current.frame.width !== next.frame.width ||
      current.frame.height !== next.frame.height
    ) {
      return false;
    }
    if (current.kind === "division" && next.kind === "division" && current.occludesContent !== next.occludesContent) {
      return false;
    }
  }
  return true;
}
