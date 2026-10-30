import { Redirect, useGlobalSearchParams, useRouter } from "expo-router";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { useAuthSession } from "../lib/use-auth-session";
import { LogWorkoutChooser } from "./log-workout-chooser";
import { useMainTabs } from "./main-tabs-context";
import { colors } from "./theme";

export function MainTabsGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useGlobalSearchParams<{ redirect?: string | string[] }>();
  const { ready, session } = useAuthSession();
  const { selectedGroupId, setWorkoutChooserVisible, workoutChooserVisible } = useMainTabs();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);

  if (!ready) return <View style={styles.fill} />;
  if (!session) {
    return (
      <Redirect
        href={inviteRedirect ? { pathname: "/sign-in", params: { redirect: inviteRedirect } } : "/sign-in"}
      />
    );
  }

  return (
    <View style={styles.fill}>
      {children}
      {selectedGroupId ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.background, flex: 1 },
});
