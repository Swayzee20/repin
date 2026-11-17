export const DELETE_CONFIRMATION = "DELETE";
export const HANDOVER_COLLAPSED_COUNT = 4;
export const DANGER_WARNING = "This happens right away and can't be undone.";
export const DANGER_DELETION_LIST =
  "Your profile, workouts, posts, photos, comments, reactions, PRs, and goals will be deleted from every crew.";
export const DANGER_DISABLED_HELPER = "Type DELETE and enter your password to confirm.";
export const DANGER_WRONG_PASSWORD = "Wrong password. Try again.";
export const DANGER_FAILED = "Couldn't delete your account. Try again.";
export const DANGER_PREVIEW_LOADING = "Loading your crews…";
export const DANGER_PREVIEW_FAILED = "Couldn't load your crews. Retry.";

export type DeletionPreviewCrew = {
  groupId: string;
  name: string;
  closes: boolean;
  successorDisplayName: string | null;
};

export function handoverRowLabel(crew: DeletionPreviewCrew) {
  if (crew.closes) return `${crew.name}, Closes, no other members.`;
  return `${crew.name}, ${crew.successorDisplayName ?? "A member"} becomes owner.`;
}

export function handoverOutcome(crew: DeletionPreviewCrew) {
  if (crew.closes) return "Closes, no other members";
  return `${crew.successorDisplayName ?? "A member"} becomes owner`;
}
