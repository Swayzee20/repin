import type { LayoutMode } from "../ui/layout-math";

export type CommunityContextPane = "progress" | "highlights" | "activity";

export function isCommunityContextPane(value: string | null | undefined): value is CommunityContextPane {
  return value === "progress" || value === "highlights" || value === "activity";
}

export function communityHeaderIsCompact(mode: LayoutMode) {
  return mode !== "twoPane";
}

export function communityContextOpensPushed(mode: LayoutMode) {
  return mode !== "twoPane";
}

export function communityWhoReactedInContentPane(mode: LayoutMode) {
  return mode === "twoPane";
}

export function communitySwitcherInBoardPane(mode: LayoutMode) {
  return mode === "twoPane";
}

export function communityContextRoute(pane: CommunityContextPane) {
  if (pane === "progress") return "/community/progress";
  if (pane === "highlights") return "/community/highlights";
  return "/community/activity";
}

export const communityLayoutRecipes = {
  compact: {
    header: "one-line" as const,
    context: "push" as const,
    splitView: false,
  },
  wide: {
    header: "one-line" as const,
    context: "push" as const,
    splitView: true,
  },
  twoPane: {
    header: "two-line" as const,
    context: "right-pane" as const,
    splitView: false,
  },
} as const;

export function communityLayoutRecipe(mode: LayoutMode) {
  return communityLayoutRecipes[mode];
}
