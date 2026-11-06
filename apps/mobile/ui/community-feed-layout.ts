import { colors, radii } from "./theme";

/** SPEC: 3 pt brand left edge on the viewer's own Community posts. */
export const ownPostEdgeWidth = 3;

/** Existing unfolded selected ring. Stays a 2 pt inset, not the own-post marker. */
export const selectedCardInsetWidth = 2;

export const ownPostVoiceOverLabel = "Your post";

export function isOwnPost(
  userId: string | undefined,
  viewerUserId: string | null | undefined,
): boolean {
  return Boolean(viewerUserId) && userId === viewerUserId;
}

export function workoutFeedCardLabel({
  isOwn,
  title,
}: {
  isOwn: boolean;
  title: string;
}): string {
  const details = `Open ${title} workout details`;
  return isOwn ? `${ownPostVoiceOverLabel}. ${details}` : details;
}

export function communityFeedCardLayout() {
  return {
    alignSelf: "stretch" as const,
    width: "100%" as const,
  };
}

export function ownPostMarkerStyle() {
  return {
    backgroundColor: colors.brand,
    borderBottomLeftRadius: radii.lg,
    borderTopLeftRadius: radii.lg,
    width: ownPostEdgeWidth,
  };
}

/** Own-post edge and selected inset ring stay different shapes when both apply. */
export function ownPostAndSelectedMarkers() {
  return {
    own: {
      color: colors.brand,
      placement: "left-edge" as const,
      width: ownPostEdgeWidth,
    },
    selected: {
      color: colors.brand,
      placement: "inset-ring" as const,
      width: selectedCardInsetWidth,
    },
  };
}
