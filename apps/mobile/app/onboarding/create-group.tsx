import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { Button, Card, TextField } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import { colors, layout, size, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function CreateFirstGroupScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
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
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <TwoPane
          column="form"
          contentPaddingBottom={spacing.xxl}
          fallback="stack"
          keyboardShouldPersistTaps="handled"
          left={(
            <View style={styles.pane}>
              <RoundIconButton accessibilityLabel="Get Started" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
              <Text style={styles.eyebrow}>BUILD YOUR CREW</Text>
              <Text style={styles.title}>Create a group</Text>
              <Text style={styles.intro}>Give your community a name. You’ll become the owner automatically.</Text>
            </View>
          )}
          right={(
            <View style={twoPane ? styles.actionSplit : styles.actionStack}>
              <Card style={styles.formCard}>
                <TextField
                  autoFocus
                  error={error}
                  label="Group name"
                  maxLength={80}
                  onChangeText={setName}
                  onSubmitEditing={() => void createGroup()}
                  placeholder="Sunday Strength Club"
                  returnKeyType="done"
                  value={name}
                />
                <Button
                  disabled={!name.trim()}
                  disabledReason={name.trim() ? undefined : "Enter a group name."}
                  loading={submitting}
                  loadingLabel="Creating group"
                  onPress={() => void createGroup()}
                >
                  Create Group
                </Button>
              </Card>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  actionSplit: { maxWidth: layout.formMax, paddingTop: size.hit + spacing.xl, width: "100%" },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  formCard: { gap: spacing.lg, padding: spacing.xl },
});
