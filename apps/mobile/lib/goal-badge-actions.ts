import type { GoalBadge, WorkoutFeedItem } from "@repin/types";
import { useCallback, useState } from "react";

import { removeSessionGoalBadges, restoreSessionGoalBadges } from "./goals-api";

export function useGoalBadgeUndo(onChange: (sessionId: string, badges: GoalBadge[]) => void) {
  const [removed, setRemoved] = useState<{
    badges: GoalBadge[];
    groupId: string;
    sessionId: string;
  } | null>(null);

  const remove = useCallback(async (workout: WorkoutFeedItem) => {
    const previous = workout.goalBadges ?? [];
    if (!previous.length) return;
    onChange(workout.id, []);
    setRemoved({
      badges: previous,
      groupId: workout.groupId,
      sessionId: workout.id,
    });
    try {
      await removeSessionGoalBadges(workout.groupId, workout.id);
    } catch {
      onChange(workout.id, previous);
      setRemoved(null);
    }
  }, [onChange]);

  const undo = useCallback(async () => {
    if (!removed) return;
    const snapshot = removed;
    setRemoved(null);
    onChange(snapshot.sessionId, snapshot.badges);
    try {
      const restored = await restoreSessionGoalBadges(
        snapshot.groupId,
        snapshot.sessionId,
        snapshot.badges.map((badge) => badge.periodId),
      );
      onChange(snapshot.sessionId, restored);
    } catch {
      onChange(snapshot.sessionId, []);
      setRemoved(snapshot);
    }
  }, [onChange, removed]);

  const clear = useCallback(() => setRemoved(null), []);

  return {
    clear,
    remove,
    undo,
    visible: Boolean(removed),
  };
}
