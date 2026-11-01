import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { Card, LoadingState, Lockup } from "../../ui/components";
import { pressableFocused, webFocusRing } from "../../ui/focus-ring";
import { Chevron, Icon, type IconName } from "../../ui/icons";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { colors, layout, radii, size, spacing, type } from "../../ui/theme";

export default function GroupOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { router.replace("/"); return; }
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/");
      else setSession(data.session);
      setLoading(false);
    });
  }, [router]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/");
  }, [router]);

  const intro = (
    <View style={[styles.pane, panePadding(twoPane, insets, "left")]}>
      <View style={styles.topRow}>
        <Lockup />
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={(state) => [styles.signOutButton, webFocusRing(pressableFocused(state))]}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.intro}>
        <Text style={styles.eyebrow}>WELCOME TO REPIN</Text>
        <Text style={styles.title}>How do you want to get started?</Text>
        <Text style={styles.subtitle}>Choose the path that fits your crew. You can always join more groups later.</Text>
      </View>
    </View>
  );

  const options = (
    <View style={[styles.pane, panePadding(twoPane, insets, "right")]}>
      <View style={[styles.options, !twoPane && styles.optionsStacked]}>
        <OptionCard
          icon="person.2"
          onPress={() => router.push("./join-group")}
          subtitle="Enter an invite code or use a link from your crew."
          title="Join a Group"
        />
        <OptionCard
          icon="plus"
          onPress={() => router.push("./create-group")}
          subtitle="Start a new group and invite your people."
          title="Create a Group"
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={twoPane ? [] : ["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        column="readable"
        fallback={loading || !session ? "hide-left" : "stack"}
        left={loading || !session ? <View style={styles.pane} /> : intro}
        right={loading || !session ? (
          <View style={[styles.pane, styles.loading, panePadding(twoPane, insets, "right")]}>
            <LoadingState message="Checking your account…" />
          </View>
        ) : options}
      />
    </SafeAreaView>
  );
}

function OptionCard({
  icon,
  onPress,
  subtitle,
  title,
}: {
  icon: IconName;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [styles.optionPressable, webFocusRing(pressableFocused(state))]}
    >
      {(state) => (
        <Card style={[styles.option, state.pressed && styles.optionPressed]}>
          <View style={styles.optionIcon}>
            <Icon color={colors.brand} name={icon} size={size.icon.md} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{title}</Text>
            <Text style={styles.optionSubtitle}>{subtitle}</Text>
          </View>
          <Chevron color={colors.brand} />
        </Card>
      )}
    </Pressable>
  );
}

function panePadding(
  twoPane: boolean,
  insets: { bottom: number; top: number },
  side: "left" | "right",
): ViewStyle {
  const top = twoPane ? insets.top + spacing.xxl : spacing.xxl;
  const bottom = twoPane ? insets.bottom + spacing.xxl : spacing.xxl;
  if (twoPane) return { paddingBottom: bottom, paddingTop: top };
  if (side === "left") return { paddingTop: top };
  return { paddingBottom: bottom };
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  pane: { flexGrow: 1 },
  loading: { justifyContent: "center" },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  signOutButton: { alignItems: "center", justifyContent: "center", minHeight: size.hit, paddingHorizontal: spacing.sm },
  signOut: { color: colors.muted, ...type.label },
  intro: { marginTop: spacing.huge },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.sm },
  subtitle: { color: colors.muted, ...type.body, marginTop: spacing.md, maxWidth: layout.formMax },
  options: { gap: spacing.lg },
  optionsStacked: { marginTop: spacing.xxxl },
  optionPressable: { alignSelf: "stretch" },
  option: { alignItems: "center", flexDirection: "row", gap: spacing.lg },
  optionPressed: { backgroundColor: colors.selection },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: size.control,
    justifyContent: "center",
    width: size.control,
  },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.ink, ...type.heading },
  optionSubtitle: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
});
