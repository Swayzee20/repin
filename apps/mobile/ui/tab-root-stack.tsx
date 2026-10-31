import { Stack } from "expo-router";
import { Platform } from "react-native";

import { useAuthSession } from "../lib/use-auth-session";
import { useMainTabs } from "./main-tabs-context";
import { RoundIconButton } from "./primitives";
import { tabRootChrome } from "./tab-root-header";
import { colors } from "./theme";
import { useStripState } from "./vertical-bar-edge";

export default function TabRootStack() {
  const strip = useStripState();
  const { session } = useAuthSession();
  const { openWorkoutChooser, selectedGroupId } = useMainTabs();
  const chrome = tabRootChrome(strip, {
    hasSelectedGroup: Boolean(selectedGroupId),
    hasSession: Boolean(session),
    platform: Platform.OS,
  });

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackVisible: false,
        headerShadowVisible: false,
        headerShown: chrome.headerShown,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.brand,
        title: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerRight: chrome.control === "header-button"
            ? () => (
              <RoundIconButton
                accessibilityLabel="Rep in"
                kind="plus"
                onPress={openWorkoutChooser}
              />
            )
            : undefined,
          headerShown: chrome.headerShown,
          title: "",
        }}
      >
        {chrome.control === "toolbar" ? (
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
