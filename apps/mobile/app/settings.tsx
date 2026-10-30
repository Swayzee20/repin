import { useRouter } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import { BackButton, Button, TextField } from "../ui/components";
import { colors, radii, spacing, type } from "../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function SettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    setSigningOut(false);
    if (signOutError) setError(signOutError.message);
    else router.replace("/");
  };

  const deleteAccount = async () => {
    if (confirmation.trim() !== "DELETE" || !supabase) return;
    setDeleting(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Sign in again before deleting your account.");
      }
      const response = await fetch(`${apiUrl}/api/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Sign in again before deleting your account."
            : body?.error ?? "Account could not be deleted.",
        );
      }
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/");
    } catch (deleteError) {
      setDeleting(false);
      setError(deleteError instanceof Error ? deleteError.message : "Account could not be deleted.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.intro}>Manage your repin account.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button loading={signingOut} onPress={() => void signOut()} variant="secondary">Sign out</Button>

        <View style={styles.deleteSection}>
          <Text style={styles.deleteTitle}>Delete account</Text>
          <Text style={styles.deleteCopy}>
            This permanently deletes your profile, workouts, comments, reactions, and photos. It can’t be undone.
          </Text>
          <Text style={styles.deleteCopy}>
            If you own a group, the member who has been there the longest becomes the owner. A group with no other members is deleted, including its invite code and posts.
          </Text>
          {confirmingDelete ? (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>Confirm deletion</Text>
              <Text style={styles.confirmCopy}>Type DELETE to permanently delete your account.</Text>
              <TextField
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect={false}
                editable={!deleting}
                label="Confirmation"
                onChangeText={setConfirmation}
                placeholder="DELETE"
                value={confirmation}
              />
              <Button
                disabled={confirmation.trim() !== "DELETE"}
                loading={deleting}
                onPress={() => void deleteAccount()}
                variant="danger"
              >
                Delete account
              </Button>
              <Button
                disabled={deleting}
                onPress={() => {
                  setConfirmingDelete(false);
                  setConfirmation("");
                  setError(null);
                }}
                variant="secondary"
              >
                Cancel
              </Button>
            </View>
          ) : (
            <Button onPress={() => setConfirmingDelete(true)} variant="danger">Delete account</Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  title: { color: colors.ink, ...type.screenTitle },
  intro: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.sm },
  error: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
  deleteSection: { gap: spacing.md, marginTop: spacing.xxxl },
  deleteTitle: { color: colors.ink, ...type.heading },
  deleteCopy: { color: colors.muted, ...type.bodySmall },
  confirmPanel: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.lg,
  },
  confirmTitle: { color: colors.danger, ...type.heading },
  confirmCopy: { color: colors.inkSoft, ...type.bodySmall },
});
