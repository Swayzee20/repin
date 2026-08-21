import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";

import { supabase } from "../lib/supabase";
import { BackButton, Button } from "../ui/components";
import { colors, spacing, type } from "../ui/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setSigningOut(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    setSigningOut(false);
    if (signOutError) setError(signOutError.message);
    else router.replace("/");
  }, [router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.intro}>Manage your RepIn account.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button loading={signingOut} onPress={() => void signOut()} variant="secondary">Sign out</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: spacing.xxl },
  title: { color: colors.ink, ...type.screenTitle },
  intro: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.sm },
  error: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
});
