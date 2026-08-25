import { useLocalSearchParams, useRouter } from "expo-router";

import { BackButton, Screen, StateCard } from "../../ui/components";
import { WorkoutDetailView } from "../../ui/workout-detail";

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    sessionId?: string | string[];
  }>();
  const groupId = firstParam(params.groupId);
  const sessionId = firstParam(params.sessionId);

  return (
    <Screen>
      <BackButton label="Community" onPress={() => router.back()} />
      {groupId && sessionId ? (
        <WorkoutDetailView groupId={groupId} refreshOnFocus sessionId={sessionId} />
      ) : (
        <StateCard
          message="This workout link is invalid."
          title="Workout unavailable"
        />
      )}
    </Screen>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
