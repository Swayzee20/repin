import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuthSession } from "../lib/use-auth-session";
import { supabase } from "../lib/supabase";
import { Button, Card, TextField } from "../ui/components";
import { TwoPane, useLayoutMode } from "../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../ui/pushed-header";
import { colors, layout, size, spacing, type } from "../ui/theme";
import { useStripState } from "../ui/vertical-bar-edge";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function SettingsScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const { session } = useAuthSession();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const twoPane = mode === "twoPane";
  const [signingOut, setSigningOut] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const email = session?.user.email?.trim();
  const confirmed = confirmation.trim() === "DELETE";

  const signOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    setAccountError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    setSigningOut(false);
    if (signOutError) setAccountError(signOutError.message);
    else router.replace("/");
  };

  const deleteAccount = async () => {
    if (!confirmed || !supabase) return;
    setDeleting(true);
    setDeleteError(null);
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
    } catch (deleteFailure) {
      setDeleting(false);
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Account could not be deleted.");
    }
  };

  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}
        >
          <TwoPane
            column="form"
            contentPaddingBottom={spacing.xxl}
            fallback="stack"
            keyboardShouldPersistTaps="handled"
            left={(
              <View style={styles.pane}>
                {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                <Text style={styles.title}>Settings</Text>
                <Text style={styles.intro}>Manage your repin account.</Text>
                <Card style={styles.accountCard}>
                  <Text style={styles.signedInLabel}>Signed in as</Text>
                  <Text style={styles.signedInValue}>{email || "your repin account"}</Text>
                  {accountError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{accountError}</Text> : null}
                  <Button loading={signingOut} loadingLabel="Signing out" onPress={() => void signOut()} variant="secondary">Sign out</Button>
                </Card>
              </View>
            )}
            right={(
              <View style={twoPane ? (roundBack ? [styles.actionSplit, styles.actionSplitOffset] : styles.actionSplit) : styles.actionStack}>
                <Card style={styles.dangerCard}>
                  <Text style={styles.dangerTitle}>Danger zone</Text>
                  <Text style={styles.dangerCopy}>
                    This permanently deletes your profile, workouts, comments, reactions, and photos. It can’t be undone.
                  </Text>
                  <Text style={styles.dangerCopy}>
                    If you own a group, the member who has been there the longest becomes the owner. A group with no other members is deleted, including its invite code and posts.
                  </Text>
                  <TextField
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect={false}
                    disabled={deleting}
                    label="Type DELETE to confirm"
                    onChangeText={setConfirmation}
                    placeholder="DELETE"
                    value={confirmation}
                  />
                  {deleteError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{deleteError}</Text> : null}
                  <Button
                    disabled={!confirmed}
                    disabledReason={confirmed ? undefined : "Type DELETE to confirm."}
                    loading={deleting}
                    loadingLabel="Deleting"
                    onPress={() => void deleteAccount()}
                    variant="danger"
                  >
                    Delete account
                  </Button>
                </Card>
              </View>
            )}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  title: { color: colors.ink, ...type.screenTitle },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  accountCard: { gap: spacing.lg, marginTop: spacing.xxl },
  signedInLabel: { color: colors.muted, ...type.label },
  signedInValue: { color: colors.ink, ...type.body },
  error: { color: colors.danger, ...type.bodySmall },
  actionSplit: { maxWidth: layout.formMax, width: "100%" },
  actionSplitOffset: { paddingTop: size.hit + spacing.xl },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  dangerCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  dangerTitle: { color: colors.danger, ...type.heading },
  dangerCopy: { color: colors.inkSoft, ...type.bodySmall },
});
