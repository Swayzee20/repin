import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../../ui/icons";
import { MainTabsGate } from "../../ui/main-tabs-gate";
import { MainTabsProvider } from "../../ui/main-tabs-context";
import { webTabIconName } from "../../ui/tab-root-header";
import { colors, size, spacing, type } from "../../ui/theme";

export default function MainTabsLayout() {
  return (
    <MainTabsProvider>
      <MainTabsGate>
        <WebTabs />
      </MainTabsGate>
    </MainTabsProvider>
  );
}

function WebTabs() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = size.primary + spacing.sm + insets.bottom;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => (
          <Icon
            color={typeof color === "string" ? color : colors.muted}
            name={webTabIconName(route.name)}
            size={size.icon.md}
          />
        ),
        tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: insets.bottom }],
      })}
    >
      <Tabs.Screen name="(home)" options={{ title: "Home" }} />
      <Tabs.Screen name="community" options={{ title: "Community" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Cancels React Navigation's default elevation: 8. boxShadow would stack with that library elevation.
    elevation: 0,
    paddingTop: spacing.xs,
  },
  tabLabel: { ...type.label },
});
