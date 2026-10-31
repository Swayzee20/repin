import { colors, elevation, size, spacing } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "danger";
export type RoundIconKind = "back" | "close" | "plus";
export type RoundIconLook = "glass" | "photo";
export type SegmentedSize = "md" | "sm";

export const roundIconDiameter = size.hit;
export const roundIconIconSize = size.icon.md;

/** §3.1 puts 6 between a control and its helper. The spacing scale has no 6. */
export const controlHelperGap = 6;

export type ButtonAppearance = {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  color: string;
  height: number;
  showSpinner: boolean;
};

export function buttonAppearance({
  disabled,
  loading,
  pressed,
  variant,
}: {
  disabled: boolean;
  loading: boolean;
  pressed: boolean;
  variant: ButtonVariant;
}): ButtonAppearance {
  const height = variant === "tonal" ? size.hit : size.primary;
  if (loading) {
    return { ...enabledButton(variant, false), height, showSpinner: true };
  }
  if (disabled) {
    return {
      backgroundColor: colors.disabledFill,
      borderColor: colors.disabledFill,
      borderWidth: 0,
      color: colors.disabledText,
      height,
      showSpinner: false,
    };
  }
  return { ...enabledButton(variant, pressed), height, showSpinner: false };
}

export function buttonShowsDisabledReason(disabled: boolean, loading: boolean, reason: string | undefined) {
  return disabled && !loading && Boolean(reason);
}

function enabledButton(variant: ButtonVariant, pressed: boolean): Omit<ButtonAppearance, "height" | "showSpinner"> {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: pressed ? colors.brandPressed : colors.brand,
        borderColor: pressed ? colors.brandPressed : colors.brand,
        borderWidth: 0,
        color: colors.surface,
      };
    case "secondary":
      return {
        backgroundColor: pressed ? colors.selection : colors.surface,
        borderColor: colors.borderStrong,
        borderWidth: 1,
        color: colors.ink,
      };
    case "tonal":
      return {
        backgroundColor: pressed ? colors.selection : colors.brandTint,
        borderColor: pressed ? colors.selection : colors.brandTint,
        borderWidth: 0,
        color: colors.brand,
      };
    case "danger":
      return {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
        borderWidth: 0,
        color: colors.surface,
      };
  }
}

export function roundIconLabel(kind: RoundIconKind) {
  if (kind === "close") return "Close";
  if (kind === "back") return "Back";
  return "Add";
}

export function roundIconChrome({
  kind,
  look,
  pressed,
}: {
  kind: RoundIconKind;
  look: RoundIconLook;
  pressed: boolean;
}): {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  boxShadow: string | undefined;
  iconColor: string;
  iconName: "chevron.left" | "plus" | "xmark";
} {
  if (kind === "plus") {
    return {
      backgroundColor: pressed ? colors.brandPressed : colors.brand,
      borderColor: pressed ? colors.brandPressed : colors.brand,
      borderWidth: 0,
      boxShadow: undefined,
      iconColor: colors.surface,
      iconName: "plus",
    };
  }
  if (look === "photo") {
    return {
      backgroundColor: pressed ? colors.scrimPhoto : colors.photoFill,
      borderColor: colors.photoRing,
      borderWidth: 1,
      boxShadow: undefined,
      iconColor: colors.surface,
      iconName: kind === "close" ? "xmark" : "chevron.left",
    };
  }
  return {
    backgroundColor: pressed ? colors.selection : colors.glassFill,
    borderColor: colors.glassEdge,
    borderWidth: 1,
    boxShadow: elevation.glass,
    iconColor: colors.ink,
    iconName: kind === "close" ? "xmark" : "chevron.left",
  };
}

export function segmentedMetrics(controlSize: SegmentedSize) {
  const track = controlSize === "sm" ? size.iconButton : size.control;
  const inset = spacing.xs;
  const hitSlop = controlSize === "sm" ? spacing.xs : 0;
  return {
    hitSlop,
    inset,
    thumb: track - inset * 2,
    track,
  };
}

export function nextSegmentValue<T extends string>(current: T | null, option: T, allowClear: boolean): T | null {
  if (allowClear && current === option) return null;
  return option;
}

export function isSegmentSelected<T extends string>(current: T | null, option: T) {
  return current === option;
}

export function segmentTextColor(selected: boolean, disabled: boolean) {
  if (disabled) return colors.disabledText;
  if (selected) return colors.brand;
  return colors.ink;
}

export function segmentThumbColor(selected: boolean, pressed: boolean, disabled: boolean) {
  if (selected) return colors.selection;
  if (disabled || !pressed) return "transparent";
  return colors.surfaceMuted;
}
