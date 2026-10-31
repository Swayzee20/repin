import { Stack } from "expo-router";
import { useStripPresent } from "./vertical-bar-edge";

import { useAuthSession } from "../lib/use-auth-session";
import { useMainTabs } from "./main-tabs-context";
import { colors } from "./theme";

export default function TabRootStack() {
  const stripPresent = useStripPresent();
  const { session } = useAuthSession();
  const { openWorkoutChooser, selectedGroupId } = useMainTabs();
  const showRepIn = stripPresent && Boolean(session && selectedGroupId);

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackVisible: false,
        headerShadowVisible: false,
        headerShown: stripPresent,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.brand,
        title: "",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: stripPresent, title: "" }}>
        {showRepIn ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              accessibilityLabel="Rep in"
              icon="plus"
              onPress={openWorkoutChooser}
              tintColor={colors.brand}
              variant="prominent"
            >
              Rep in
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}
