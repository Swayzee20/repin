/**
 * Shared keyboard behavior for the mobile app.
 *
 * - Scroll views that can hold a focused field dismiss on drag. `handled`
 *   lets buttons and fields receive taps while the keyboard is up; a tap that
 *   nothing handles (empty space) dismisses it.
 * - iOS multiline fields and number/decimal pads share one bar above the
 *   keyboard (`KeyboardDoneAccessory`). Multiline fields and the last numeric
 *   field show Done. A numeric field whose Return key is Next shows Next,
 *   because those pads have no Return key.
 * - Single-line fields in a form use Return to focus the next field. The last
 *   field submits or dismisses, depending on the caller.
 */

/**
 * Bottom inset for a centered overlay while the keyboard is up. The keyboard
 * already covers the home indicator, so take the larger of the two instead of
 * adding them.
 */
export function overlayBottomInset(keyboardHeight: number, safeBottom: number) {
  const keyboard = Number.isFinite(keyboardHeight) ? Math.max(0, keyboardHeight) : 0;
  const safe = Number.isFinite(safeBottom) ? Math.max(0, safeBottom) : 0;
  return Math.max(safe, keyboard);
}

/** Keyboard frame overlap for a full-screen overlay. Hidden frames report 0. */
export function keyboardOverlapFromFrame(
  endCoordinates: { height: number; screenY: number },
  windowHeight: number,
) {
  const height = Number.isFinite(endCoordinates.height) ? endCoordinates.height : 0;
  const screenY = Number.isFinite(endCoordinates.screenY) ? endCoordinates.screenY : Number.NaN;
  const window = Number.isFinite(windowHeight) ? windowHeight : 0;
  if (height <= 0) return 0;
  if (Number.isFinite(screenY) && screenY >= window - 1) return 0;
  return Math.max(0, height);
}

export const keyboardDoneAccessoryId = "repin-keyboard-done";

export const returnKeyTypes = ["done", "go", "join", "next", "search", "send"] as const;

export type ReturnKeyType = (typeof returnKeyTypes)[number];

export type KeyboardScrollProps = {
  keyboardDismissMode: "none" | "on-drag";
  keyboardShouldPersistTaps: "handled";
};

export function keyboardScrollProps(os: string): KeyboardScrollProps {
  return {
    keyboardDismissMode: os === "web" ? "none" : "on-drag",
    keyboardShouldPersistTaps: "handled",
  };
}

export function showsKeyboardDoneBar(os: string) {
  return os === "ios";
}

export function multilineAccessoryProps(os: string): { inputAccessoryViewID: string } | Record<string, never> {
  if (!showsKeyboardDoneBar(os)) return {};
  return { inputAccessoryViewID: keyboardDoneAccessoryId };
}

/** iOS number-pad and decimal-pad have no Return key, so they use the same Done bar. */
export function numberPadAccessoryProps(os: string) {
  return multilineAccessoryProps(os);
}

export type FieldChainProps = {
  blurOnSubmit: boolean;
  onSubmitEditing: () => void;
  returnKeyType: ReturnKeyType;
};

/**
 * Return-key props for one single-line field.
 * Fields before the last keep the keyboard up and call `onAdvance`.
 * The last field blurs and calls `onFinish` (submit, or omit to only dismiss).
 */
export function fieldChainProps({
  count,
  index,
  last = "done",
  onAdvance,
  onFinish,
}: {
  count: number;
  index: number;
  last?: ReturnKeyType;
  onAdvance: () => void;
  onFinish?: () => void;
}): FieldChainProps {
  const isLast = count <= 0 || index < 0 || index >= count - 1;
  return {
    blurOnSubmit: isLast,
    onSubmitEditing: () => {
      if (isLast) onFinish?.();
      else onAdvance();
    },
    returnKeyType: isLast ? last : "next",
  };
}

export function singleFieldReturn(last: ReturnKeyType, onFinish?: () => void) {
  return fieldChainProps({
    count: 1,
    index: 0,
    last,
    onAdvance: () => {},
    onFinish,
  });
}
