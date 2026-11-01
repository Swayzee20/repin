import type { ReservedRegion } from "./reserved-regions-availability";
import { layout, spacing } from "./theme";

export type LayoutMode = "compact" | "wide" | "twoPane";

export type ActiveDivision = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
};

export type PaneBox = {
  width: number;
  x: number;
};

export type LayoutSplit = {
  foldActive: boolean;
  foldHalf: number;
  gap: number;
  left: PaneBox;
  right: PaneBox;
  splitX: number;
  /** Vertical book fold. A horizontal crease does not move the columns. */
  vertical: boolean;
};

export type LayoutSnapshot = {
  contentWidth: number;
  mode: LayoutMode;
  split: LayoutSplit;
};

export type LayoutInput = {
  division?: ActiveDivision | null;
  insets: { left: number; right: number };
  width: number;
};

/** Division region in provider coordinates. Occlusions and non-finite frames are ignored. */
export function activeDivisionFromRegions(regions: readonly ReservedRegion[]): ActiveDivision | null {
  const division = regions.find((region) => region.kind === "division");
  if (division?.kind !== "division") return null;
  const { height, width, x, y } = division.frame;
  if (![height, width, x, y].every((value) => Number.isFinite(value))) return null;
  return {
    centerX: x + width / 2,
    centerY: y + height / 2,
    height,
    width,
  };
}

const defaultCardInset = spacing.xxl * 2;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: number) {
  return Math.max(0, finite(value));
}

function safeDivision(division: ActiveDivision | null | undefined): ActiveDivision | null {
  if (!division) return null;
  const centerX = finite(division.centerX, Number.NaN);
  const centerY = finite(division.centerY, Number.NaN);
  const width = finite(division.width, Number.NaN);
  const height = finite(division.height, Number.NaN);
  if (![centerX, centerY, width, height].every(Number.isFinite)) return null;
  return { centerX, centerY, height: Math.max(0, height), width: Math.max(0, width) };
}

export function resolveLayout({ division = null, insets, width }: LayoutInput): LayoutSnapshot {
  const safeWidth = nonNegative(width);
  const safeInsets = { left: nonNegative(insets.left), right: nonNegative(insets.right) };
  const contentWidth = Math.max(0, safeWidth - safeInsets.left - safeInsets.right);
  const split = paneSplit({ division: safeDivision(division), insets: safeInsets, width: safeWidth });
  const panesFit = split.left.width >= layout.paneMin && split.right.width >= layout.paneMin;
  const mode: LayoutMode = contentWidth < layout.compactMax
    ? "compact"
    : contentWidth < layout.twoPaneMin || !panesFit
      ? "wide"
      : "twoPane";
  return { contentWidth, mode, split };
}

export function paneSplit({
  division = null,
  insets,
  width,
}: LayoutInput): LayoutSplit {
  const safeWidth = nonNegative(width);
  const leftInset = nonNegative(insets.left);
  const rightInset = nonNegative(insets.right);
  const fold = safeDivision(division);
  const vertical = Boolean(fold && fold.height >= fold.width && fold.width > 0);
  const splitX = nonNegative(vertical && fold ? fold.centerX : safeWidth / 2);
  const foldHalf = nonNegative(vertical && fold ? fold.width / 2 : 0);
  const gap = nonNegative(Math.max(layout.paneGutter, foldHalf + layout.foldClearance));
  const leftX = leftInset + layout.margin;
  const rightX = splitX + gap;
  return {
    foldActive: vertical,
    foldHalf,
    gap,
    left: {
      x: leftX,
      width: Math.max(0, splitX - gap - leftX),
    },
    right: {
      x: rightX,
      width: Math.max(0, safeWidth - rightInset - layout.margin - rightX),
    },
    splitX,
    vertical,
  };
}

export type CenteredCardFrame = {
  height: number;
  justifyContent: "center";
  left: number;
  top: number;
  width: number;
};

export function centeredCardFrame({
  cardInset = defaultCardInset,
  division = null,
  height,
  insets,
  width,
}: {
  /** Horizontal inset subtracted from the content width before the form-max cap. Default is 48. */
  cardInset?: number;
  division?: ActiveDivision | null;
  height: number;
  insets: { bottom: number; left: number; right: number; top: number };
  width: number;
}): CenteredCardFrame {
  const safeWidth = nonNegative(width);
  const safeHeight = nonNegative(height);
  const safeInsets = {
    bottom: nonNegative(insets.bottom),
    left: nonNegative(insets.left),
    right: nonNegative(insets.right),
    top: nonNegative(insets.top),
  };
  const contentWidth = Math.max(0, safeWidth - safeInsets.left - safeInsets.right);
  const preferred = Math.min(Math.max(0, contentWidth - nonNegative(cardInset)), layout.formMax);
  const fold = safeDivision(division);
  const horizontalFold = Boolean(fold && fold.width > fold.height && fold.height > 0);
  const verticalFold = Boolean(fold && !horizontalFold && fold.width > 0);
  const split = paneSplit({
    division: verticalFold ? fold : null,
    insets: safeInsets,
    width: safeWidth,
  });
  const regionLeft = verticalFold ? split.splitX + split.gap : safeInsets.left;
  const regionRight = safeWidth - safeInsets.right;
  const regionWidth = Math.max(0, regionRight - regionLeft);
  const cardWidth = Math.min(preferred, regionWidth);
  const left = regionLeft + Math.max(0, regionWidth - cardWidth) / 2;

  if (!horizontalFold || !fold) {
    return {
      height: Math.max(0, safeHeight - safeInsets.top - safeInsets.bottom),
      justifyContent: "center",
      left,
      top: safeInsets.top,
      width: cardWidth,
    };
  }

  const band = fold.height / 2 + layout.foldClearance;
  const above = fold.centerY - band - safeInsets.top;
  const below = safeHeight - safeInsets.bottom - (fold.centerY + band);
  if (below >= above) {
    const top = fold.centerY + band;
    return {
      height: Math.max(0, safeHeight - safeInsets.bottom - top),
      justifyContent: "center",
      left,
      top,
      width: cardWidth,
    };
  }
  return {
    height: Math.max(0, fold.centerY - band - safeInsets.top),
    justifyContent: "center",
    left,
    top: safeInsets.top,
    width: cardWidth,
  };
}

export type ScrollAnchor = {
  id: string;
  offset: number;
};

export type AnchoredItem = {
  height: number;
  id: string;
  y: number;
};

export function topVisibleAnchor(items: readonly AnchoredItem[], scrollY: number): ScrollAnchor | null {
  if (items.length === 0) return null;
  const ordered = [...items].sort((left, right) => left.y - right.y || left.id.localeCompare(right.id));
  const top = ordered.find((item) => item.y + item.height > scrollY + 0.5) ?? ordered[ordered.length - 1];
  if (!top) return null;
  return { id: top.id, offset: scrollY - top.y };
}

export function anchoredScrollOffset(
  item: { height: number; y: number },
  anchor: ScrollAnchor,
  contentHeight: number,
  viewportHeight: number,
): number {
  const maxOffset = Math.max(0, nonNegative(contentHeight) - nonNegative(viewportHeight));
  const target = nonNegative(finite(item.y) + finite(anchor.offset));
  return Math.min(maxOffset, target);
}
