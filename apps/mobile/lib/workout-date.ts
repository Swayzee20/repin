import type { WorkoutFeedItem } from "@repin/types";

export function resolveWorkoutDate(
  workout: Pick<WorkoutFeedItem, "completedAt" | "createdAt" | "occurredAt">,
) {
  for (const value of [workout.occurredAt, workout.completedAt, workout.createdAt]) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function formatWorkoutDate(workout: WorkoutFeedItem) {
  const date = resolveWorkoutDate(workout);
  if (!date) return "Date unavailable";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
