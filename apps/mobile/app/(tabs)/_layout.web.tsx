import { Feather, FontAwesome6 } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MainTabsGate } from "../../ui/main-tabs-gate";
import { MainTabsProvider } from "../../ui/main-tabs-context";
import { colors, fonts, spacing } from "../../ui/theme";

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
  const tabBarHeight = 58 + insets.bottom;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => route.name === "(home)" ? (
          <Text style={[styles.tabIcon, { color }, focused && styles.activeIcon]}>⌂</Text>
        ) : route.name === "community" ? (
          <Feather color={typeof color === "string" ? color : undefined} name="users" size={23} />
        ) : (
          <FontAwesome6 color={color} name="circle-user" size={23} />
        ),
        tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: insets.bottom }],
      })}
    >
      <Tabs.Screen name="(home)" options={{ title: "Home" }} />
      <Tabs.Screen name="community" options={{ title: "Community" }} />
      <Tabs.Screen name="profile" options={{ title: "Me" }} />
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
  tabLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  tabIcon: { fontFamily: fonts.medium, fontSize: 23, lineHeight: 25 },
  activeIcon: { fontFamily: fonts.bold },
});
