import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { BackButton, Button, TextField } from "../../ui/components";
import { colors, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function CreateFirstGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGroup = useCallback(async () => {
    const groupName = name.trim();
    setError(null);
    if (!groupName) { setError("Enter a group name."); return; }
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSubmitting(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to create a group.");
      const response = await fetch(`${apiUrl}/api/groups`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName }),
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as { error?: string; group?: { id: string } };
      if (!response.ok || !body.group) throw new Error(body.error ?? "Group could not be created.");
      router.replace("/");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Group could not be created.");
    } finally { setSubmitting(false); }
  }, [name, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <BackButton label="Get Started" onPress={() => router.back()} />
          <Text style={styles.eyebrow}>BUILD YOUR CREW</Text>
          <Text style={styles.title}>Create a group</Text>
          <Text style={styles.intro}>Give your community a name. You’ll become the owner automatically.</Text>
          <View style={styles.formCard}>
            <TextField autoFocus label="Group name" maxLength={80} onChangeText={setName} onSubmitEditing={() => void createGroup()} placeholder="Sunday Strength Club" returnKeyType="done" value={name} />
            {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
            <Button disabled={!name.trim()} loading={submitting} onPress={() => void createGroup()}>Create Group</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, flex: { flex: 1 }, container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.display, marginTop: spacing.xs }, intro: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.sm },
  formCard: { gap: spacing.lg }, errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md }, errorText: { color: colors.danger, ...type.bodySmall },
});
