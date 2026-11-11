import { layout } from "./theme";

/** Goals have no preview pane. Save stays at the bottom in every layout. */
export const goalFormSavePlacement = "bottom" as const;

export type GoalFormSheetFrame = {
  left: number;
  paneLeft: number;
  paneWidth: number;
  savePlacement: typeof goalFormSavePlacement;
  twoPane: false;
  width: number;
};

function finiteNonNegative(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * Size the New / Edit goal column inside the content pane, clear of the
 * side strip. A page sheet (folded then unfolded, iPad, Split View) is
 * narrower than the window — never switch to TwoPane, or Save paints in
 * the window’s trailing pane and clips as “Sa…”.
 */
export function goalFormSheetFrame({
  frameWidth,
  insets,
  windowWidth,
}: {
  frameWidth: number | null;
  insets: { left: number; right: number };
  windowWidth: number;
}): GoalFormSheetFrame {
  const safeWindow = finiteNonNegative(windowWidth);
  const leftInset = finiteNonNegative(insets.left);
  const rightInset = finiteNonNegative(insets.right);
  const measured = frameWidth != null && Number.isFinite(frameWidth) && frameWidth > 0
    ? frameWidth
    : safeWindow;
  const hostWidth = Math.min(measured, safeWindow || measured);
  const paneLeft = Math.min(leftInset, hostWidth);
  const paneWidth = Math.max(0, hostWidth - paneLeft - Math.min(rightInset, hostWidth - paneLeft));
  const width = Math.min(paneWidth, layout.maxReadable);
  const left = paneLeft + Math.max(0, (paneWidth - width) / 2);
  return {
    left,
    paneLeft,
    paneWidth,
    savePlacement: goalFormSavePlacement,
    twoPane: false,
    width,
  };
}

export function goalFormOverlapsStrip(
  frame: Pick<GoalFormSheetFrame, "left" | "width">,
  hostWidth: number,
  insets: { left: number; right: number },
) {
  const leftInset = finiteNonNegative(insets.left);
  const rightInset = finiteNonNegative(insets.right);
  const paneRight = Math.max(0, finiteNonNegative(hostWidth) - rightInset);
  return frame.left < leftInset || frame.left + frame.width > paneRight + 0.5;
}
