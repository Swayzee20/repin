import { Feather, FontAwesome6 } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { Tabs, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { clearWorkoutDetailCaches } from "../../lib/workout-detail-cache";
import { LogWorkoutChooser } from "../../ui/log-workout-chooser";
import { MainTabsProvider, useMainTabs } from "../../ui/main-tabs-context";
import { colors, fonts, radii, spacing } from "../../ui/theme";

export default function MainTabsLayout() {
  return (
    <MainTabsProvider>
      <MainTabsNavigator />
    </MainTabsProvider>
  );
}

function MainTabsNavigator() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    openWorkoutChooser,
    selectedGroupId,
    setWorkoutChooserVisible,
    workoutChooserVisible,
  } = useMainTabs();
  const [session, setSession] = useState<Session | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const authUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      authUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (authUserId.current && authUserId.current !== nextUserId) {
        clearWorkoutDetailCaches();
      }
      authUserId.current = nextUserId;
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const tabBarHeight = 58 + insets.bottom;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, focused }) => route.name === "index" ? (
            <Text style={[styles.tabIcon, { color }, focused && styles.activeIcon]}>⌂</Text>
          ) : route.name === "community" ? (
            <Feather color={color} name="users" size={23} />
          ) : (
            <FontAwesome6 color={color} name="circle-user" size={23} />
          ),
          tabBarStyle: session
            ? [styles.tabBar, { height: tabBarHeight, paddingBottom: insets.bottom }]
            : styles.hiddenTabBar,
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="community" options={{ title: "Community" }} />
        <Tabs.Screen name="profile" options={{ title: "Me" }} />
      </Tabs>
      {session && selectedGroupId && !keyboardVisible ? (
        <Pressable
          accessibilityRole="button"
          onPress={openWorkoutChooser}
          style={({ pressed }) => [
            styles.logWorkout,
            { bottom: tabBarHeight + spacing.md },
            pressed && styles.logWorkoutPressed,
          ]}
        >
          <Feather color={colors.surface} name="plus" size={14} />
          <Text style={styles.logWorkoutText}>Check in</Text>
        </Pressable>
      ) : null}
      {session && selectedGroupId ? (
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
  root: { flex: 1 },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, paddingTop: spacing.xs },
  hiddenTabBar: { display: "none" },
  tabLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  tabIcon: { fontFamily: fonts.medium, fontSize: 23, lineHeight: 25 },
  activeIcon: { fontFamily: fonts.bold },
  logWorkout: { alignItems: "center", alignSelf: "center", backgroundColor: colors.brand, borderRadius: radii.pill, elevation: 4, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.xl, position: "absolute", shadowColor: colors.ink, shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.12, shadowRadius: 12 },
  logWorkoutPressed: { backgroundColor: colors.brandPressed, transform: [{ scale: 0.98 }] },
  logWorkoutText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 15 },
});
