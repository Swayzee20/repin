import type { LayoutSplit } from "./layout-math";
import { colors, size, spacing } from "./theme";

/** Sheet rows are at least the 48pt control. The log chooser keeps its 72pt rows. */
export const sheetRowMinHeight = size.control;
export const chooserRowMinHeight = 72;

/**
 * Side-panel geometry for the (+) chooser on a strip device.
 * The (+) centre y and the nav-pill top are measured on the iPhone Duo
 * (unfolded inner screen 951, folded outer screen 466). QA-C1 checks them
 * on device; if they drift, derive py from the top inset plus that offset.
 */
export const chooserPanel = {
  widthFraction: 0.75, // of window width
  stripAxisFromEdge: 48, // strip axis = W - 48 (trailing). Measured: 903 / 951, 418 / 466
  plusRadius: 24, // the locked 48pt (+)
  plusGap: 14, // panel edge to (+) edge
  topAbovePlus: 10, // panel top = (+) top - 10
  bottomAbovePill: 16, // panel bottom <= pill top - 16
  caret: { width: 8, height: 18 },
  padding: { top: spacing.md, bottom: spacing.lg, horizontal: spacing.xl }, // 12 / 16 / 20
} as const;

/** (+) centre y. Unfolded is the inner screen (`split.foldActive`). */
export const chooserPlusCentreY = {
  folded: 198,
  unfolded: 148,
} as const;

/** Nav pill top, same postures as `chooserPlusCentreY`. */
export const chooserPillTop = {
  folded: 492,
  unfolded: 483,
} as const;

/** Drag past 30% of the panel, or faster than 0.5 pt/ms (500 pt/s), to dismiss. */
export const chooserSwipeActivation = 6;
export const chooserSwipeDistanceFraction = 0.3;
export const chooserSwipeVelocity = 0.5;

/**
 * The modal covers the native toolbar (+) on some hosts, so the panel can
 * draw a stand-in. On the Duo the system strip draws above the modal, so the
 * real locked (+) stays visible and a stand-in doubles it — especially in
 * unfolded landscape, where the stand-in uses portrait coordinates.
 * QA-C3: keep this false while the strip (+) is up. The native (+) still
 * toggles through `toggleWorkoutChooser`.
 */
export const chooserShowsPlusAnchor = false;

/**
 * iOS `Modal` defaults to portrait-only. A portrait-locked overFullScreen
 * chooser is what kept the Duo in portrait (and froze the strip / (+)) after
 * unfolding with the panel open.
 *
 * Pass this module-level array (do not spread a new one each render). A new
 * array identity is extra native churn on the same presented controller.
 */
export const overlaySupportedOrientations = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
] as const;

export type OverlaySupportedOrientation = (typeof overlaySupportedOrientations)[number];
export const overlaySupportedOrientationsProp: OverlaySupportedOrientation[] = [...overlaySupportedOrientations];

export type ChooserPanelEdge = "leading" | "trailing";

export type ChooserOverlayKind = "panel" | "sheet";

export type ChooserOverlayState = {
  edge: ChooserPanelEdge;
  holdsPanel: boolean;
  kind: ChooserOverlayKind;
};

export type ChooserRequestClose = { type: "dismiss" } | { type: "ignore" };

export type ChooserFrameChange =
  | { frameKey: string; type: "opened" }
  | { frameKey: string; type: "relayout" }
  | { type: "idle" };

/**
 * Keep the strip chooser open across fold/unfold and Split View. Dismissing
 * the overFullScreen modal during a size change is what closed the panel and
 * left iOS stuck until a rotate.
 */
export function chooserOnFrameKeyChange({
  frameKey,
  openKey,
  visible,
}: {
  frameKey: string;
  openKey: string | null;
  visible: boolean;
}): ChooserFrameChange {
  if (!visible) return { type: "idle" };
  if (openKey === null) return { frameKey, type: "opened" };
  if (openKey === frameKey) return { type: "idle" };
  return { frameKey, type: "relayout" };
}

export function chooserResolvedEdge(
  edge: ChooserPanelEdge | null | undefined,
  held: ChooserPanelEdge,
): ChooserPanelEdge {
  return edge === "leading" || edge === "trailing" ? edge : held;
}

/**
 * Folded Duo still has the side strip, so the open host is the side panel.
 * A closed unfold already becomes two-pane; do not replace that panel Modal
 * when the rail edge is briefly null, and do not treat iOS `onRequestClose`
 * as a user dismiss.
 */
export function nextChooserOverlayState(
  previous: ChooserOverlayState | null,
  input: {
    ios: boolean;
    stripEdge: ChooserPanelEdge | null;
    stripPresent: boolean;
    visible: boolean;
  },
): ChooserOverlayState {
  const holdsPanel = Boolean(input.ios && input.visible && (input.stripPresent || previous?.holdsPanel));
  const edge = chooserResolvedEdge(input.stripEdge, previous?.edge ?? "trailing");
  return {
    edge,
    holdsPanel,
    kind: input.ios && (holdsPanel || input.stripPresent) ? "panel" : "sheet",
  };
}

export function chooserHostRemounts(
  previous: ChooserOverlayKind | null,
  next: ChooserOverlayKind,
) {
  return previous !== null && previous !== next;
}

export function chooserFrameKey({
  edge,
  foldActive,
  width,
}: {
  edge: ChooserPanelEdge;
  foldActive: boolean;
  width: number;
}) {
  return `${width}:${foldActive ? "unfolded" : "folded"}:${edge}`;
}

/**
 * iOS can invoke `onRequestClose` when an overFullScreen modal is torn down
 * during a size-class change. X, backdrop, swipe, and accessibility escape
 * still call `close()` directly. Android back still dismisses.
 */
export function chooserOnNativeRequestClose({
  os,
  visible,
}: {
  os: string;
  visible: boolean;
}): ChooserRequestClose {
  if (!visible) return { type: "ignore" };
  if (os === "ios") return { type: "ignore" };
  return { type: "dismiss" };
}

export const chooserMotion = {
  closeMs: 200,
  openOpacityFrom: 0.35,
  openOpacityMs: 180,
  openSpring: { damping: 22, mass: 1, stiffness: 260 },
  reduceCloseMs: 150,
  reduceOpenMs: 200,
  scrimCloseMs: 160,
  scrimOpenMs: 200,
} as const;

export function chooserMeasuredAnchor(foldActive: boolean) {
  if (foldActive) {
    return { pillTop: chooserPillTop.unfolded, py: chooserPlusCentreY.unfolded };
  }
  return { pillTop: chooserPillTop.folded, py: chooserPlusCentreY.folded };
}

export type ChooserPanelFrame = {
  bottomLimit: number;
  caretOffsetY: number;
  caretTip: { x: number; y: number };
  /** +1 dismisses toward the trailing edge, -1 toward the leading edge. */
  dismissDirection: 1 | -1;
  left: number;
  maxHeight: number;
  offscreenX: number;
  plusCentre: { x: number; y: number };
  right: number;
  top: number;
  width: number;
};

function emptyChooserPanelFrame(dismissDirection: 1 | -1): ChooserPanelFrame {
  return {
    bottomLimit: 0,
    caretOffsetY: 0,
    caretTip: { x: 0, y: 0 },
    dismissDirection,
    left: 0,
    maxHeight: 0,
    offscreenX: 0,
    plusCentre: { x: 0, y: 0 },
    right: 0,
    top: 0,
    width: 0,
  };
}

/** Panel frame for the strip chooser. Pure: no window or inset reads. */
export function chooserPanelFrame({
  W,
  edge,
  pillTop,
  py,
}: {
  W: number;
  edge: ChooserPanelEdge;
  pillTop: number;
  py: number;
}): ChooserPanelFrame {
  const trailing = edge !== "leading";
  const dismissDirection = trailing ? 1 : -1;
  if (!Number.isFinite(W) || W < 0 || !Number.isFinite(py) || !Number.isFinite(pillTop)) {
    return emptyChooserPanelFrame(dismissDirection);
  }

  const width = Math.round(chooserPanel.widthFraction * W);
  const inset = chooserPanel.stripAxisFromEdge + chooserPanel.plusRadius + chooserPanel.plusGap;
  const right = trailing ? W - inset : inset + width;
  const left = trailing ? right - width : inset;
  const top = py - chooserPanel.plusRadius - chooserPanel.topAbovePlus;
  const bottomLimit = pillTop - chooserPanel.bottomAbovePill;
  const plusX = trailing ? W - chooserPanel.stripAxisFromEdge : chooserPanel.stripAxisFromEdge;
  return {
    bottomLimit,
    caretOffsetY: py - top - chooserPanel.caret.height / 2,
    caretTip: {
      x: trailing ? right + chooserPanel.caret.width : left - chooserPanel.caret.width,
      y: py,
    },
    dismissDirection,
    left,
    maxHeight: Math.max(0, bottomLimit - top),
    offscreenX: trailing ? W - left : -(left + width),
    plusCentre: { x: plusX, y: py },
    right,
    top,
    width,
  };
}

export function chooserSwipeShouldDismiss({
  distance,
  velocity,
  width,
}: {
  distance: number;
  velocity: number;
  width: number;
}) {
  return distance > chooserSwipeDistanceFraction * width || velocity > chooserSwipeVelocity;
}

/** Drag past this distance to dismiss a sheet. 72, from the spacing scale. */
export const sheetDismissDistance = spacing.huge + spacing.xxxl;

/** MovementPicker is a full sheet. Spec §3.5 leaves 54pt above the grabber. */
export const pickerSheetTopGap = 54;
export const pickerRowHeight = size.control + spacing.sm;
export const pickerCheckSize = size.icon.md + spacing.sm;

/** Menu rows match ListRow. */
export const menuItemMinHeight = size.primary;

/** Popover width used when a menu is anchored to a button. */
export const menuPopoverWidth = 208;

/** Reason rows are taller than a menu row so the detail line fits. */
export const reportReasonRowMinHeight = 58;

/** StateCard action is the 48pt secondary control. The icon slot is 36pt. */
export const stateActionHeight = size.control;
export const stateIconSize = size.iconButton;

/** Date picker Cancel and Done are 44pt. */
export const dateActionHeight = size.hit;

export function menuItemColor(danger: boolean) {
  return danger ? colors.danger : colors.ink;
}

export function sheetRowBackground(selected: boolean, pressed: boolean) {
  if (selected || pressed) return colors.selection;
  return "transparent";
}

export function sheetFrame({
  height,
  insets,
  split,
  topGap,
  width,
}: {
  height: number;
  insets: { bottom: number; left: number; right: number; top: number };
  split: LayoutSplit;
  topGap?: number;
  width: number;
}) {
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
  const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
  const leftInset = Math.max(0, Number.isFinite(insets.left) ? insets.left : 0);
  const rightInset = Math.max(0, Number.isFinite(insets.right) ? insets.right : 0);
  const topInset = Math.max(0, Number.isFinite(insets.top) ? insets.top : 0);
  const bottomInset = Math.max(0, Number.isFinite(insets.bottom) ? insets.bottom : 0);
  const rightEdge = Math.max(0, safeWidth - rightInset);
  const trailingLeft = split.foldActive ? split.right.x : leftInset;
  let left = Math.min(Math.max(0, trailingLeft), rightEdge);
  let sheetWidth = Math.max(0, rightEdge - left);
  if (sheetWidth <= 0) {
    left = leftInset;
    sheetWidth = Math.max(0, safeWidth - leftInset - rightInset);
  }
  const gap = topGap == null ? topInset + spacing.xl : Math.max(0, Number.isFinite(topGap) ? topGap : 0);
  return {
    bottomInset,
    left,
    maxHeight: Math.max(0, safeHeight - gap),
    width: sheetWidth,
  };
}
