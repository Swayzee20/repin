import { resolveUserDisplayName, type WorkoutFeedItem } from "@repin/types";

import type { IconName } from "../ui/icons";

export type ContentMenuItem = {
  danger?: boolean;
  icon?: IconName;
  label: string;
  onPress: () => void;
};

export function postMenuItems(input: {
  blockLabel?: string;
  onBlock?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  onReport?: () => void;
}): ContentMenuItem[] {
  const items: ContentMenuItem[] = [];
  if (input.onEdit) items.push({ icon: "pencil", label: "Edit", onPress: input.onEdit });
  if (input.onDelete) items.push({ danger: true, icon: "trash", label: "Delete", onPress: input.onDelete });
  if (input.onReport) items.push({ icon: "flag", label: "Report", onPress: input.onReport });
  if (input.onBlock) items.push({ icon: "nosign", label: input.blockLabel ?? "Block", onPress: input.onBlock });
  if (input.onRemove) items.push({ danger: true, icon: "trash", label: "Remove", onPress: input.onRemove });
  return items;
}

export function workoutMenuItems(input: {
  onBlock?: (workout: WorkoutFeedItem) => void;
  onDelete?: (workout: WorkoutFeedItem) => void;
  onEdit?: (workout: WorkoutFeedItem) => void;
  onRemove?: (workout: WorkoutFeedItem) => void;
  onReport?: (workout: WorkoutFeedItem) => void;
  viewerIsOwner?: boolean;
  viewerUserId?: string | null;
  workout: WorkoutFeedItem;
}): ContentMenuItem[] {
  if (!input.viewerUserId) return [];
  const own = input.viewerUserId === input.workout.userId;
  if (own) {
    return postMenuItems({
      onDelete: input.onDelete ? () => input.onDelete?.(input.workout) : undefined,
      onEdit: input.onEdit ? () => input.onEdit?.(input.workout) : undefined,
    });
  }
  return postMenuItems({
    blockLabel: `Block ${resolveUserDisplayName({ displayName: input.workout.displayName })}`,
    onBlock: input.onBlock ? () => input.onBlock?.(input.workout) : undefined,
    onRemove: input.viewerIsOwner && input.onRemove ? () => input.onRemove?.(input.workout) : undefined,
    onReport: input.onReport ? () => input.onReport?.(input.workout) : undefined,
  });
}

export function commentMenuItems(input: {
  blockLabel?: string;
  onBlock?: () => void;
  onDelete?: () => void;
  onRemove?: () => void;
  onReport?: () => void;
}): ContentMenuItem[] {
  return postMenuItems(input);
}
