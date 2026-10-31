import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen, StateCard } from "../../ui/components";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import { colors } from "../../ui/theme";
import { WorkoutDetailView } from "../../ui/workout-detail";

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    sessionId?: string | string[];
  }>();
  const groupId = firstParam(params.groupId);
  const sessionId = firstParam(params.sessionId);
  const back = (
    <RoundIconButton
      accessibilityLabel="Community"
      kind="back"
      onPress={() => router.back()}
      style={roundNavButtonStyle}
    />
  );

  if (!groupId || !sessionId) {
    return (
      <Screen>
        {back}
        <StateCard
          message="This workout link is invalid."
          title="Workout unavailable"
        />
      </Screen>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <WorkoutDetailView
        groupId={groupId}
        leading={back}
        presentation="session"
        refreshOnFocus
        sessionId={sessionId}
      />
    </SafeAreaView>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
});
