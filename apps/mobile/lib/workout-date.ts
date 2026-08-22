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
  return date.toDateString() === today.toDateString()
    ? `Today · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
