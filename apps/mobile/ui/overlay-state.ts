import type { LayoutSplit } from "./layout-math";
import { colors, size, spacing } from "./theme";

/** Sheet rows are at least the 48pt control. The log chooser keeps its 72pt rows. */
export const sheetRowMinHeight = size.control;
export const chooserRowMinHeight = 72;

/** Drag past this distance to dismiss a sheet. 72, from the spacing scale. */
export const sheetDismissDistance = spacing.huge + spacing.xxxl;

/** Menu rows match ListRow. */
export const menuItemMinHeight = size.primary;

/** Popover width used when a menu is anchored to a button. */
export const menuPopoverWidth = 176;

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
  width,
}: {
  height: number;
  insets: { bottom: number; left: number; right: number; top: number };
  split: LayoutSplit;
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
  return {
    bottomInset,
    left,
    maxHeight: Math.max(0, safeHeight - topInset - spacing.xl),
    width: sheetWidth,
  };
}
