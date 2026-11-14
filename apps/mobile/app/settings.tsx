import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchDeletionPreview } from "../lib/delete-account";
import { listBlockedUsers } from "../lib/moderation-api";
import { removePushTokenForSession } from "../lib/push-notifications";
import { isSentryTestActionVisible, sendSentryTestError } from "../lib/sentry";
import { useAuthSession } from "../lib/use-auth-session";
import { supabase } from "../lib/supabase";
import { Button, Card } from "../ui/components";
import {
  DANGER_FAILED,
  DANGER_WRONG_PASSWORD,
  DangerZoneCard,
} from "../ui/danger-zone";
import type { DeletionPreviewCrew } from "../ui/danger-zone-copy";
import { TwoPane, useLayoutMode } from "../ui/layout";
import { ListRow, RoundIconButton, roundNavButtonStyle } from "../ui/primitives";
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
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeletionPreviewCrew[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [crewsExpanded, setCrewsExpanded] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [testStatus, setTestStatus] = useState<"sent" | "disabled" | null>(null);
  const showSentryTest = isSentryTestActionVisible();
  useFocusEffect(useCallback(() => {
    let active = true;
    void listBlockedUsers().then((people) => {
      if (active) setBlockedCount(people.length);
    }).catch(() => {
      if (active) setBlockedCount(0);
    });
    return () => {
      active = false;
    };
  }, []));
  const email = session?.user.email?.trim();

  const loadPreview = useCallback(async () => {
    if (!supabase) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Sign in again before deleting your account.");
      }
      setPreview(await fetchDeletionPreview(data.session.access_token));
    } catch {
      setPreview(null);
      setPreviewError("Couldn't load your crews. Retry.");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadPreview();
  }, [loadPreview]));

  const signOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    setAccountError(null);
    const { data } = await supabase.auth.getSession();
    await removePushTokenForSession(data.session?.access_token);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    setSigningOut(false);
    if (signOutError) setAccountError(signOutError.message);
    else router.replace("/");
  };

  const deleteAccount = async () => {
    if (!supabase) return;
    setDeleting(true);
    setDeleteError(null);
    setPasswordError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Sign in again before deleting your account.");
      }
      const response = await fetch(`${apiUrl}/api/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      if (!response.ok) {
        if (body?.code === "wrong_password" || (response.status === 403 && body?.error === DANGER_WRONG_PASSWORD)) {
          setPasswordError(DANGER_WRONG_PASSWORD);
          setDeleting(false);
          return;
        }
        throw new Error(
          response.status === 401
            ? "Sign in again before deleting your account."
            : DANGER_FAILED,
        );
      }
      await removePushTokenForSession(data.session.access_token);
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/");
    } catch {
      setDeleting(false);
      setDeleteError(DANGER_FAILED);
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
                <Card style={styles.privacyCard}>
                  <Text style={styles.privacyTitle}>Privacy and safety</Text>
                  <ListRow
                    label="Blocked accounts"
                    onPress={() => router.push("/blocked-accounts")}
                    value={blockedCount > 0 ? String(blockedCount) : undefined}
                  />
                </Card>
                {showSentryTest ? (
                  <Card style={styles.diagnosticsCard}>
                    <Text style={styles.diagnosticsTitle}>Diagnostics</Text>
                    <Text style={styles.diagnosticsCopy}>
                      Sends one test error so monitoring can be confirmed. It does not include your email, workouts, or posts.
                    </Text>
                    <Button onPress={() => setTestStatus(sendSentryTestError())} variant="secondary">Send a test error</Button>
                    {testStatus === "sent" ? (
                      <Text accessibilityLiveRegion="polite" style={styles.diagnosticsSent}>Test error sent.</Text>
                    ) : null}
                    {testStatus === "disabled" ? (
                      <Text accessibilityLiveRegion="polite" style={styles.diagnosticsCopy}>Error monitoring is off in this build.</Text>
                    ) : null}
                  </Card>
                ) : null}
              </View>
            )}
            right={(
              <View style={twoPane ? (roundBack ? [styles.actionSplit, styles.actionSplitOffset] : styles.actionSplit) : styles.actionStack}>
                <DangerZoneCard
                  confirmation={confirmation}
                  crewsExpanded={crewsExpanded}
                  deleteError={deleteError}
                  deleting={deleting}
                  onChangeConfirmation={setConfirmation}
                  onChangePassword={(value) => {
                    setPassword(value);
                    setPasswordError(null);
                    setDeleteError(null);
                  }}
                  onDelete={() => void deleteAccount()}
                  onForgotPassword={() => router.push("/forgot-password")}
                  onRetryPreview={() => void loadPreview()}
                  onToggleCrews={() => setCrewsExpanded((open) => !open)}
                  password={password}
                  passwordError={passwordError}
                  preview={preview}
                  previewError={previewError}
                  previewLoading={previewLoading}
                />
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
  privacyCard: { gap: spacing.sm, marginTop: spacing.lg, paddingBottom: spacing.sm },
  privacyTitle: { color: colors.ink, ...type.section },
  diagnosticsCard: { gap: spacing.lg, marginTop: spacing.xxl },
  diagnosticsTitle: { color: colors.ink, ...type.heading },
  diagnosticsCopy: { color: colors.muted, ...type.bodySmall },
  diagnosticsSent: { color: colors.success, ...type.bodySmall },
  signedInLabel: { color: colors.muted, ...type.label },
  signedInValue: { color: colors.ink, ...type.body },
  error: { color: colors.danger, ...type.bodySmall },
  actionSplit: { maxWidth: layout.formMax, width: "100%" },
  actionSplitOffset: { paddingTop: size.hit + spacing.xl },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
});
