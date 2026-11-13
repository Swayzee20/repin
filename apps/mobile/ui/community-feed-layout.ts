import { colors, type } from "./theme";

/** Existing unfolded selected ring. Stays a 2 pt inset, not the own-post marker. */
export const selectedCardInsetWidth = 2;

export const ownPostYouTagLabel = "You";

/** Feed-consistency SPEC §3 option 2: 18 pt pill, 6 pt pad, 6 pt gap from the name, radius 9. */
export const ownPostYouTagHeight = 18;
export const ownPostYouTagPadding = 6;
export const ownPostYouTagGap = 6;
export const ownPostYouTagRadius = 9;
export const ownPostYouTagBorderWidth = 1;

export function isOwnPost(
  userId: string | undefined,
  viewerUserId: string | null | undefined,
): boolean {
  return Boolean(viewerUserId) && userId === viewerUserId;
}

export function workoutFeedCardLabel({ title }: { title: string }): string {
  return `Open ${title} workout details`;
}

export function generalPostFeedCardLabel() {
  return "Open post details";
}

export function communityFeedCardLayout() {
  return {
    alignSelf: "stretch" as const,
    width: "100%" as const,
  };
}

export function ownPostYouTagStyle() {
  return {
    alignItems: "center" as const,
    alignSelf: "center" as const,
    backgroundColor: colors.brandTint,
    borderColor: colors.tonalEdge,
    borderRadius: ownPostYouTagRadius,
    borderWidth: ownPostYouTagBorderWidth,
    flexShrink: 0,
    height: ownPostYouTagHeight,
    justifyContent: "center" as const,
    marginLeft: ownPostYouTagGap,
    paddingHorizontal: ownPostYouTagPadding,
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
      border: colors.tonalEdge,
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
