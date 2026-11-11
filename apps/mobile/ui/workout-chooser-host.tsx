import { useRouter } from "expo-router";

import { LogWorkoutChooser } from "./log-workout-chooser";
import { useMainTabsIfPresent } from "./main-tabs-context";

/**
 * Hosts the locked (+) chooser outside `(tabs)/` so pushed screens can open it.
 * Renders nothing when the tabs context is missing or no crew is selected —
 * it does not invent strip or plus state.
 */
export function WorkoutChooserHost() {
  const router = useRouter();
  const tabs = useMainTabsIfPresent();
  if (!tabs?.selectedGroupId) return null;
  const { selectedGroupId, setWorkoutChooserVisible, workoutChooserVisible } = tabs;
  return (
    <LogWorkoutChooser
      onDetailedWorkout={() => {
        setWorkoutChooserVisible(false);
        router.push(`/groups/${selectedGroupId}/detailed-workout`);
      }}
      onDismiss={() => setWorkoutChooserVisible(false)}
      onQuickLog={() => {
        setWorkoutChooserVisible(false);
        router.push(`/groups/${selectedGroupId}/log-workout`);
      }}
      visible={workoutChooserVisible}
    />
  );
}
