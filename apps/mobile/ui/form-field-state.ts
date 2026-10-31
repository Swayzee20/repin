import { colors, fonts, radii, size, spacing, type } from "./theme";
import { controlHelperGap } from "./primitive-state";

/** §3.1 spacing. 15pt labels remap to bodySmall (§2.2); there is no 15 step. */
export const formSpacing = {
  cardGap: spacing.lg,
  fieldGap: spacing.lg,
  groupPadding: spacing.xl,
  helperGap: controlHelperGap,
  labelGap: spacing.sm,
} as const;

export const textFieldHeight = size.control;
export const textFieldRadius = radii.md;
export const textFieldPadding = spacing.lg;
export const textFieldBorderWidth = 1;
export const textFieldEmphasisBorderWidth = 2;

export const textAreaMinHeight = 96;
export const textAreaMaxHeight = 160;

export const photoTileHeight = textAreaMaxHeight;
export const photoDismissVisual = 32;
export const photoDismissHitSlop = (size.hit - photoDismissVisual) / 2;

export const flameTileSize = size.hit;
export const flameGlyphSize = Math.round(flameTileSize * 0.7);
export const emptyFlameOpacity = 0.35;

export const choiceTileHeight = size.control;
export const dateRowHeight = size.primary;

export const secondsRangeMessage = "0-59 only";
export const photoUploadErrorMessage = "Upload failed. Retry";
export const photoAddLabel = "Add photo";
export const pickerPlaceholder = "Choose...";

export const effortLabels = [
  "Light work",
  "Felt good",
  "Solid work",
  "That was rough",
  "I'm cooked",
] as const;

export const fieldLabelText = {
  color: colors.inkSoft,
  fontFamily: fonts.bold,
  fontSize: type.bodySmall.fontSize,
  lineHeight: type.bodySmall.lineHeight,
} as const;

export const optionalText = {
  color: colors.muted,
  fontFamily: fonts.medium,
  fontSize: type.label.fontSize,
  lineHeight: type.label.lineHeight,
} as const;

export const helperText = {
  color: colors.muted,
  fontFamily: fonts.regular,
  fontSize: type.label.fontSize,
  lineHeight: type.label.lineHeight,
} as const;

export const errorText = {
  color: colors.danger,
  fontFamily: fonts.semibold,
  fontSize: type.label.fontSize,
  lineHeight: type.label.lineHeight,
} as const;

export const suffixText = {
  color: colors.muted,
  fontFamily: fonts.regular,
  fontSize: type.bodySmall.fontSize,
  lineHeight: type.bodySmall.lineHeight,
} as const;

export const choiceText = {
  fontFamily: fonts.medium,
  fontSize: type.bodySmall.fontSize,
  lineHeight: type.bodySmall.lineHeight,
} as const;

export const dateRowLabelText = {
  color: colors.ink,
  fontFamily: fonts.bold,
  fontSize: type.body.fontSize,
  lineHeight: type.body.lineHeight,
} as const;

export const dateRowValueText = {
  color: colors.muted,
  fontFamily: type.bodySmall.fontFamily,
  fontSize: type.bodySmall.fontSize,
  lineHeight: type.bodySmall.lineHeight,
} as const;

export type FieldInteraction = "default" | "disabled" | "error" | "focus";

export function resolveFieldInteraction({
  disabled,
  error,
  focused,
}: {
  disabled: boolean;
  error: boolean;
  focused: boolean;
}): FieldInteraction {
  if (disabled) return "disabled";
  if (error) return "error";
  if (focused) return "focus";
  return "default";
}

export function fieldChrome(state: FieldInteraction) {
  const borderWidth = state === "focus" || state === "error" ? textFieldEmphasisBorderWidth : textFieldBorderWidth;
  return {
    backgroundColor: state === "disabled" ? colors.disabledFill : colors.surface,
    borderColor: state === "disabled"
      ? colors.disabledFill
      : state === "error"
        ? colors.danger
        : state === "focus"
          ? colors.brand
          : colors.borderStrong,
    borderRadius: textFieldRadius,
    borderWidth,
    color: state === "disabled" ? colors.disabledText : colors.ink,
    height: textFieldHeight,
    paddingHorizontal: textFieldPadding - (borderWidth - textFieldBorderWidth),
    placeholderColor: state === "disabled" ? colors.disabledText : colors.subtle,
  };
}

export function textAreaHeight(contentHeight: number) {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return textAreaMinHeight;
  return Math.min(textAreaMaxHeight, Math.max(textAreaMinHeight, Math.ceil(contentHeight)));
}

export type NumberKind = "decimal" | "number";

export function numberFieldKeyboard(kind: NumberKind) {
  if (kind === "decimal") {
    return { inputMode: "decimal" as const, keyboardType: "decimal-pad" as const };
  }
  return { inputMode: "numeric" as const, keyboardType: "number-pad" as const };
}

export function secondsRangeError(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return secondsRangeMessage;
  const seconds = Number(text);
  if (!Number.isInteger(seconds) || seconds > 59) return secondsRangeMessage;
  return null;
}

export function photoUploadFieldError(message: string | null | undefined) {
  if (!message?.startsWith("Photo upload failed")) return null;
  return photoUploadErrorMessage;
}

export function choiceTileChrome({ disabled, selected }: { disabled: boolean; selected: boolean }) {
  if (disabled) {
    return {
      backgroundColor: colors.disabledFill,
      borderColor: colors.disabledFill,
      borderWidth: textFieldBorderWidth,
      color: colors.disabledText,
      height: choiceTileHeight,
      paddingHorizontal: textFieldPadding,
      radius: radii.md,
      showCheck: false,
    };
  }
  if (selected) {
    return {
      backgroundColor: colors.brandTint,
      borderColor: colors.brand,
      borderWidth: textFieldEmphasisBorderWidth,
      color: colors.ink,
      height: choiceTileHeight,
      paddingHorizontal: textFieldPadding - 1,
      radius: radii.md,
      showCheck: true,
    };
  }
  return {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: textFieldBorderWidth,
    color: colors.ink,
    height: choiceTileHeight,
    paddingHorizontal: textFieldPadding,
    radius: radii.md,
    showCheck: false,
  };
}

export function flameTileState(level: number, value: number | null) {
  const selected = value === level;
  const filled = value != null && level <= value;
  return {
    borderColor: selected ? colors.brand : "transparent",
    borderWidth: textFieldEmphasisBorderWidth,
    color: filled ? colors.brand : colors.muted,
    filled,
    opacity: filled ? 1 : emptyFlameOpacity,
    selected,
    size: flameTileSize,
  };
}

export const photoDismissChrome = {
  backgroundColor: colors.photoFill,
  borderColor: colors.photoRing,
  borderRadius: radii.pill,
  borderWidth: 1,
  hitSlop: photoDismissHitSlop,
  iconColor: colors.surface,
  size: photoDismissVisual,
} as const;

export const photoTileChrome = {
  borderColor: colors.borderStrong,
  borderRadius: radii.lg,
  borderStyle: "dashed" as const,
  borderWidth: 1,
  height: photoTileHeight,
} as const;
