import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useVerticalBarEdge } from "./vertical-bar-edge";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthSession } from "../lib/use-auth-session";
import { useMainTabs } from "./main-tabs-context";
import { colors, radii, spacing, type } from "./theme";

export function RepInPill() {
  const edge = useVerticalBarEdge();
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const { openWorkoutChooser, selectedGroupId } = useMainTabs();
  const [focused, setFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const stripPresent = edge !== null;

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!focused || stripPresent) return;
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [focused, stripPresent]);

  if (!focused || stripPresent || !session || !selectedGroupId || keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.slot, { bottom: insets.bottom + spacing.md, left: insets.left, right: insets.right }]}
    >
      <Pressable
        accessibilityLabel="Rep in"
        accessibilityRole="button"
        onPress={openWorkoutChooser}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      >
        <Feather color={colors.surface} name="plus" size={14} />
        <Text style={styles.label}>Rep in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: "center", position: "absolute", zIndex: 20 },
  pill: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    elevation: 4,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    shadowColor: colors.ink,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  pillPressed: { backgroundColor: colors.brandPressed, transform: [{ scale: 0.98 }] },
  label: { color: colors.surface, ...type.button },
});
