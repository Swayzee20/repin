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

const cardInset = spacing.xxl * 2;

export function resolveLayout({ division = null, insets, width }: LayoutInput): LayoutSnapshot {
  const contentWidth = width - insets.left - insets.right;
  const split = paneSplit({ division, insets, width });
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
  const vertical = Boolean(division && division.height >= division.width && division.width > 0);
  const splitX = vertical && division ? division.centerX : width / 2;
  const foldHalf = vertical && division ? division.width / 2 : 0;
  const gap = Math.max(layout.paneGutter, foldHalf + layout.foldClearance);
  const leftX = insets.left + layout.margin;
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
      width: Math.max(0, width - insets.right - layout.margin - rightX),
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
  division = null,
  height,
  insets,
  width,
}: {
  division?: ActiveDivision | null;
  height: number;
  insets: { bottom: number; left: number; right: number; top: number };
  width: number;
}): CenteredCardFrame {
  const contentWidth = width - insets.left - insets.right;
  const preferred = Math.min(Math.max(0, contentWidth - cardInset), layout.formMax);
  const horizontalFold = Boolean(division && division.width > division.height && division.height > 0);
  const verticalFold = Boolean(division && !horizontalFold && division.width > 0);
  const split = paneSplit({
    division: verticalFold ? division : null,
    insets,
    width,
  });
  const regionLeft = verticalFold ? split.splitX + split.gap : insets.left;
  const regionRight = width - insets.right;
  const regionWidth = Math.max(0, regionRight - regionLeft);
  const cardWidth = Math.min(preferred, regionWidth);
  const left = regionLeft + Math.max(0, regionWidth - cardWidth) / 2;

  if (!horizontalFold || !division) {
    return {
      height: Math.max(0, height - insets.top - insets.bottom),
      justifyContent: "center",
      left,
      top: insets.top,
      width: cardWidth,
    };
  }

  const band = division.height / 2 + layout.foldClearance;
  const above = division.centerY - band - insets.top;
  const below = height - insets.bottom - (division.centerY + band);
  if (below >= above) {
    const top = division.centerY + band;
    return {
      height: Math.max(0, height - insets.bottom - top),
      justifyContent: "center",
      left,
      top,
      width: cardWidth,
    };
  }
  return {
    height: Math.max(0, division.centerY - band - insets.top),
    justifyContent: "center",
    left,
    top: insets.top,
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
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  return Math.min(maxOffset, Math.max(0, item.y + anchor.offset));
}
