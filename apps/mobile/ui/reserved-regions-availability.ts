export const reservedRegionsNativeView = "ReservedRegionsView";

export type ReservedRegionFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ReservedRegion =
  | {
      frame: ReservedRegionFrame;
      kind: "division";
      occludesContent: boolean;
    }
  | {
      frame: ReservedRegionFrame;
      kind: "occlusion";
    };

const emptyRegions: readonly ReservedRegion[] = [];

/**
 * True only when this binary ships ReservedRegionsView.
 * Expo Go (`storeClient`) does not. A missing or throwing view manager is the same fallback.
 */
export function reservedRegionsViewAvailable(input: {
  executionEnvironment: string | null | undefined;
  hasViewManager: (name: string) => boolean;
}): boolean {
  try {
    if (input.executionEnvironment === "storeClient") return false;
    return input.hasViewManager(reservedRegionsNativeView) === true;
  } catch {
    return false;
  }
}

/** Empty list when the native view cannot be used, without letting a probe throw. */
export function reservedRegionsOrEmpty(
  available: boolean,
  read: () => readonly ReservedRegion[],
): readonly ReservedRegion[] {
  if (!available) return emptyRegions;
  try {
    const regions = read();
    return Array.isArray(regions) ? regions : emptyRegions;
  } catch {
    return emptyRegions;
  }
}
