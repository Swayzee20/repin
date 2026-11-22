import { size, spacing } from "./theme";

/**
 * Distance NumberField next to mi/km/m. `flex: 1` + `minWidth: 0` lets the
 * field collapse beside the non-shrinking unit control. Grow from auto basis
 * with a real min width so the input stays typable; wrap when the row is too
 * narrow (folded Duo), stay one line when wide.
 */
export const distanceMetricFieldMinWidth = size.hit * 2 + spacing.xxxl;

export const distanceMetricFieldStyle = {
  flexBasis: "auto" as const,
  flexGrow: 1,
  flexShrink: 1,
  marginTop: 0,
  minWidth: distanceMetricFieldMinWidth,
};

export const distanceMetricRowStyle = {
  alignItems: "center" as const,
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: spacing.sm,
};

export function distanceUnitControlMinWidth(optionCount: number) {
  return size.hit * Math.max(0, optionCount);
}

export function distanceMetricRowWraps(rowWidth: number, optionCount: number) {
  return distanceMetricFieldMinWidth + spacing.sm + distanceUnitControlMinWidth(optionCount) > rowWidth;
}
