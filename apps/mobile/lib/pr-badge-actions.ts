import type { PrBadge, WorkoutFeedItem } from "@repin/types";
import { useCallback, useState } from "react";

import { removeSessionPrBadges, restoreSessionPrBadges } from "./pr-api";

export function usePrBadgeUndo(onChange: (sessionId: string, badges: PrBadge[]) => void) {
  const [removed, setRemoved] = useState<{
    badges: PrBadge[];
    groupId: string;
    sessionId: string;
  } | null>(null);

  const remove = useCallback(async (workout: WorkoutFeedItem) => {
    const previous = workout.prBadges ?? [];
    if (!previous.length) return;
    onChange(workout.id, []);
    setRemoved({
      badges: previous,
      groupId: workout.groupId,
      sessionId: workout.id,
    });
    try {
      await removeSessionPrBadges(workout.groupId, workout.id);
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
      const restored = await restoreSessionPrBadges(
        snapshot.groupId,
        snapshot.sessionId,
        snapshot.badges,
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
