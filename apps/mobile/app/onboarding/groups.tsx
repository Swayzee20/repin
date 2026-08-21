import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

export default function GroupOnboardingScreen() {
  const router = useRouter();
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

  if (loading || !session) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.brand} size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>REPIN</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>WELCOME TO REPIN</Text>
          <Text style={styles.title}>How do you want to get started?</Text>
          <Text style={styles.subtitle}>Choose the path that fits your crew. You can always join more groups later.</Text>
        </View>

        <View style={styles.options}>
          <OptionCard
            icon="→"
            onPress={() => router.push("./join-group")}
            subtitle="Enter an invite code or use a link from your crew."
            title="Join a Group"
          />
          <OptionCard
            icon="+"
            onPress={() => router.push("./create-group")}
            subtitle="Start a new group and invite your people."
            title="Create a Group"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function OptionCard({ icon, onPress, subtitle, title }: { icon: string; onPress: () => void; subtitle: string; title: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
      <View style={styles.optionIcon}><Text style={styles.optionIconText}>{icon}</Text></View>
      <View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionSubtitle}>{subtitle}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, container: { flex: 1, padding: spacing.xxl }, centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, brand: { color: colors.brand, ...type.eyebrow }, signOut: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  intro: { marginTop: spacing.huge }, eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.display, marginTop: spacing.sm }, subtitle: { color: colors.muted, ...type.body, marginTop: spacing.md, maxWidth: 340 },
  options: { gap: spacing.lg, marginTop: spacing.xxxl }, option: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: "row", minHeight: 112, padding: spacing.lg },
  optionPressed: { backgroundColor: colors.brandSoft, borderColor: colors.boardBorder, transform: [{ scale: 0.99 }] }, optionIcon: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.md, height: 48, justifyContent: "center", width: 48 },
  optionIconText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 24 }, optionCopy: { flex: 1, marginHorizontal: spacing.lg }, optionTitle: { color: colors.ink, ...type.heading }, optionSubtitle: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs }, chevron: { color: colors.brand, fontFamily: fonts.medium, fontSize: 26 },
});
