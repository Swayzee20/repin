import {
  personFirstName,
  resolveUserDisplayName,
  type GeneralPostFeedItem,
  type GroupRole,
  type WorkoutFeedItem,
} from "@repin/types";

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

export function generalPostMenuItems(input: {
  isPinned?: boolean;
  onBlock?: (post: GeneralPostFeedItem) => void;
  onDelete?: (post: GeneralPostFeedItem) => void;
  onEdit?: (post: GeneralPostFeedItem) => void;
  onPin?: (post: GeneralPostFeedItem) => void;
  onReport?: (post: GeneralPostFeedItem) => void;
  onUnpin?: (post: GeneralPostFeedItem) => void;
  post: GeneralPostFeedItem;
  viewerRole?: GroupRole | null;
  viewerUserId?: string | null;
}): ContentMenuItem[] {
  if (!input.viewerUserId) return [];
  const own = input.viewerUserId === input.post.userId;
  const owner = input.viewerRole === "owner";
  const pinItem: ContentMenuItem | null = owner
    ? {
        icon: "pin",
        label: input.isPinned ? "Unpin" : "Pin this post",
        onPress: () => (input.isPinned ? input.onUnpin?.(input.post) : input.onPin?.(input.post)),
      }
    : null;
  if (own) {
    const items: ContentMenuItem[] = [];
    if (input.onEdit) items.push({ icon: "pencil", label: "Edit", onPress: () => input.onEdit?.(input.post) });
    if (pinItem) items.push(pinItem);
    if (input.onDelete) {
      items.push({ danger: true, icon: "trash", label: "Delete", onPress: () => input.onDelete?.(input.post) });
    }
    return items;
  }
  if (owner) {
    return [
      ...(pinItem ? [pinItem] : []),
      ...postMenuItems({
        onReport: input.onReport ? () => input.onReport?.(input.post) : undefined,
        reportLabel: "Report post",
      }),
    ];
  }
  const fullName = resolveUserDisplayName({ displayName: input.post.displayName });
  return postMenuItems({
    blockLabel: `Block ${personFirstName(fullName)}`,
    onBlock: input.onBlock ? () => input.onBlock?.(input.post) : undefined,
    onReport: input.onReport ? () => input.onReport?.(input.post) : undefined,
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
