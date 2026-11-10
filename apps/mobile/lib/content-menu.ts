import { personFirstName, resolveUserDisplayName, type WorkoutFeedItem } from "@repin/types";

import type { IconName } from "../ui/icons";

export type ContentMenuItem = {
  danger?: boolean;
  icon?: IconName;
  label: string;
  onPress: () => void;
};

export function postMenuItems(input: {
  blockLabel?: string;
  editLabel?: string;
  onBlock?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onRemoveGoalBadge?: () => void;
  onRemovePrBadge?: () => void;
  onReport?: () => void;
  reportLabel?: string;
}): ContentMenuItem[] {
  const items: ContentMenuItem[] = [];
  if (input.onEdit) items.push({ icon: "pencil", label: input.editLabel ?? "Edit", onPress: input.onEdit });
  if (input.onRemoveGoalBadge) items.push({ label: "Remove Goal badge", onPress: input.onRemoveGoalBadge });
  if (input.onRemovePrBadge) items.push({ label: "Remove PR badge", onPress: input.onRemovePrBadge });
  if (input.onDelete) items.push({ danger: true, icon: "trash", label: "Delete", onPress: input.onDelete });
  if (input.onReport) items.push({ icon: "flag", label: input.reportLabel ?? "Report", onPress: input.onReport });
  if (input.onBlock) items.push({ danger: true, icon: "nosign", label: input.blockLabel ?? "Block", onPress: input.onBlock });
  return items;
}

export function workoutMenuItems(input: {
  onBlock?: (workout: WorkoutFeedItem) => void;
  onDelete?: (workout: WorkoutFeedItem) => void;
  onEdit?: (workout: WorkoutFeedItem) => void;
  onRemoveGoalBadge?: (workout: WorkoutFeedItem) => void;
  onRemovePrBadge?: (workout: WorkoutFeedItem) => void;
  onReport?: (workout: WorkoutFeedItem) => void;
  viewerUserId?: string | null;
  workout: WorkoutFeedItem;
}): ContentMenuItem[] {
  if (!input.viewerUserId) return [];
  const own = input.viewerUserId === input.workout.userId;
  if (own) {
    return postMenuItems({
      editLabel: "Edit workout",
      onDelete: input.onDelete ? () => input.onDelete?.(input.workout) : undefined,
      onEdit: input.onEdit ? () => input.onEdit?.(input.workout) : undefined,
      onRemoveGoalBadge: input.onRemoveGoalBadge && input.workout.goalBadges?.length
        ? () => input.onRemoveGoalBadge?.(input.workout)
        : undefined,
      onRemovePrBadge: input.onRemovePrBadge && input.workout.prBadges?.length
        ? () => input.onRemovePrBadge?.(input.workout)
        : undefined,
    });
  }
  const fullName = resolveUserDisplayName({ displayName: input.workout.displayName });
  return postMenuItems({
    blockLabel: `Block ${personFirstName(fullName)}`,
    onBlock: input.onBlock ? () => input.onBlock?.(input.workout) : undefined,
    onReport: input.onReport ? () => input.onReport?.(input.workout) : undefined,
    reportLabel: "Report post",
  });
}

export function commentMenuItems(input: {
  blockLabel?: string;
  onBlock?: () => void;
  onReport?: () => void;
}): ContentMenuItem[] {
  return postMenuItems({ ...input, reportLabel: "Report comment" });
}
