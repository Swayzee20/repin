import { colors, fonts, type } from "./theme";

/** Existing unfolded selected ring. Stays a 2 pt inset, not the own-post marker. */
export const selectedCardInsetWidth = 2;

export const ownPostYouTagLabel = "You";

/** Feed-consistency SPEC §3 option 2: 18 pt pill, 6 pt pad, 6 pt gap from the name, radius 9. */
export const ownPostYouTagHeight = 18;
export const ownPostYouTagPadding = 6;
export const ownPostYouTagGap = 6;
export const ownPostYouTagRadius = 9;
export const ownPostYouTagBorderWidth = 0;

/** Shared 18 pt chip recipe: You, PR, +N, kind, Goal. Radius 9 is intentional (not radii.sm). */
export const feedChipHeight = ownPostYouTagHeight;
export const feedChipPadding = ownPostYouTagPadding;
export const feedChipRadius = ownPostYouTagRadius;
export const feedChipGap = ownPostYouTagGap;

/** New post sits 14 pt below the eyebrow on compact, 12 pt on Duo / Split View. */
export const communityNewPostGapCompact = 14;
export const communityNewPostGapWide = 12;

export function communityNewPostGap(mode: "compact" | "wide" | "twoPane") {
  return mode === "compact" ? communityNewPostGapCompact : communityNewPostGapWide;
}

export function isOwnPost(
  userId: string | undefined,
  viewerUserId: string | null | undefined,
): boolean {
  return Boolean(viewerUserId) && userId === viewerUserId;
}

export function workoutFeedCardLabel({
  isOwn = false,
  title,
}: {
  isOwn?: boolean;
  title: string;
}): string {
  const action = `Open ${title} workout details`;
  return isOwn ? `Your post. ${action}` : action;
}

export function generalPostFeedCardLabel(isOwn = false) {
  return isOwn ? "Your post. Open post details" : "Open post details";
}

export function communityFeedCardLayout() {
  return {
    alignSelf: "stretch" as const,
    width: "100%" as const,
  };
}

export function tonalFeedChipStyle() {
  return {
    alignItems: "center" as const,
    backgroundColor: colors.brandTint,
    borderRadius: feedChipRadius,
    borderWidth: 0,
    height: feedChipHeight,
    justifyContent: "center" as const,
    paddingHorizontal: feedChipPadding,
  };
}

export function goalFeedChipStyle() {
  return {
    alignItems: "center" as const,
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderRadius: feedChipRadius,
    borderWidth: 2,
    height: feedChipHeight,
    justifyContent: "center" as const,
    paddingHorizontal: feedChipPadding,
  };
}

export function kindFeedChipStyle() {
  return {
    alignItems: "center" as const,
    backgroundColor: colors.surfaceMuted,
    borderRadius: feedChipRadius,
    flexShrink: 0,
    height: feedChipHeight,
    justifyContent: "center" as const,
    marginLeft: feedChipGap,
    paddingHorizontal: feedChipPadding,
  };
}

export function kindFeedChipTextStyle() {
  return {
    color: colors.inkSoft,
    fontFamily: fonts.semibold,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
  };
}

export function feedChipTextStyle() {
  return {
    color: colors.brandPressed,
    ...type.micro,
  };
}

export function ownPostYouTagStyle() {
  return {
    ...tonalFeedChipStyle(),
    alignSelf: "center" as const,
    flexShrink: 0,
    marginLeft: ownPostYouTagGap,
  };
}

export function ownPostYouTagTextStyle() {
  return {
    color: colors.brandPressed,
    ...type.micro,
  };
}

/** Name + You tag sit on one row, vertically centered. Long names truncate before the tag. */
export function ownPostAuthorNameRowStyle() {
  return {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    minWidth: 0,
  };
}

export function ownPostAuthorNameStyle() {
  return {
    flexShrink: 1,
    minWidth: 0,
  };
}

/** Own-post You tag and selected inset ring stay different shapes when both apply. */
export function ownPostAndSelectedMarkers() {
  return {
    own: {
      borderWidth: ownPostYouTagBorderWidth,
      color: colors.brandPressed,
      fill: colors.brandTint,
      label: ownPostYouTagLabel,
      placement: "author-name-tag" as const,
    },
    selected: {
      color: colors.brand,
      placement: "inset-ring" as const,
      width: selectedCardInsetWidth,
    },
  };
}
