import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clearRecoveryAddressBar,
  establishRecoverySession,
  hasRecoveryMaterial,
  isEmailAddress,
  PASSWORD_RESET_SENT_MESSAGE,
  passwordValidationMessage,
  readRecoveryLink,
  recoveryLinkFromSources,
  requestPasswordReset,
  type RecoverySessionResult,
} from "../lib/password-reset";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { BackButton, Button, LoadingState, StateCard, TextField } from "../ui/components";
import { colors, fonts, radii, spacing, type } from "../ui/theme";

type Phase = "checking" | "invalid" | "form" | "success";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    access_token?: string | string[];
    code?: string | string[];
    error?: string | string[];
    error_code?: string | string[];
    error_description?: string | string[];
    refresh_token?: string | string[];
    token?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
  }>();
  const linkingUrl = Linking.useURL();
  const capturedWebUrl = useRef(
    Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : null,
  );
  const requestId = useRef(0);
  const [phase, setPhase] = useState<Phase>("checking");
  const [established, setEstablished] = useState<RecoverySessionResult | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const searchParams = useMemo(() => ({
    access_token: params.access_token,
    code: params.code,
    error: params.error,
    error_code: params.error_code,
    error_description: params.error_description,
    refresh_token: params.refresh_token,
    token: params.token,
    token_hash: params.token_hash,
    type: params.type,
  }), [
    params.access_token,
    params.code,
    params.error,
    params.error_code,
    params.error_description,
    params.refresh_token,
    params.token,
    params.token_hash,
    params.type,
  ]);

  useEffect(() => {
    if (!supabase) return;
    const id = requestId.current + 1;
    requestId.current = id;
    const client = supabase;

    const establish = async () => {
      const liveUrl = Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
        : linkingUrl ?? await Linking.getInitialURL();
      const captured = capturedWebUrl.current ? readRecoveryLink(capturedWebUrl.current) : null;
      const link = captured && hasRecoveryMaterial(captured)
        ? captured
        : recoveryLinkFromSources({ url: liveUrl, searchParams });
      const result = await establishRecoverySession(client, link);
      if (requestId.current !== id) return;
      setEstablished(result);
      if (result.ok) {
        clearRecoveryAddressBar();
        setSignedIn(true);
        setPhase("form");
        setBanner(null);
        return;
      }
      setPhase("invalid");
      setBanner(result.message);
    };

    void establish();
  }, [linkingUrl, searchParams]);

  const returnToSignIn = async (signOutFirst: boolean) => {
    if (signOutFirst && supabase) {
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/sign-in");
      return;
    }
    router.replace(signedIn ? "/" : "/sign-in");
  };

  const sendAnotherLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setSent(false);
    if (!isEmailAddress(normalizedEmail)) {
      setBanner("Enter a valid email address.");
      return;
    }
    if (!supabase) {
      setBanner("Supabase is not configured.");
      return;
    }
    setSending(true);
    const result = await requestPasswordReset(supabase, normalizedEmail);
    setSending(false);
    if (result.kind === "error") {
      setBanner(result.message);
      setSent(false);
      return;
    }
    setBanner(null);
    setSent(true);
  };

  const updatePassword = async () => {
    const validation = passwordValidationMessage(password, confirmPassword);
    setBanner(validation);
    if (validation || !supabase) return;

    setSubmitting(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) {
      setSubmitting(false);
      const message = error?.message.toLowerCase() ?? "";
      if (!error || error.status === 401 || message.includes("session") || message.includes("jwt") || message.includes("expired")) {
        setPhase("invalid");
        setBanner("This reset link is invalid or has expired.");
        return;
      }
      setBanner(error.message);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    setSignedIn(Boolean(sessionData.session));
    setSubmitting(false);
    setPhase("success");
    setBanner(null);
  };

  if (!isSupabaseConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <StateCard message="Add the Expo public Supabase URL and publishable key before resetting a password." title="Supabase is not configured" />
          <Button onPress={() => router.replace("/sign-in")} variant="secondary">Back to Sign In</Button>
        </View>
      </SafeAreaView>
    );
  }

  const sessionEstablishedFromLink = Boolean(
    established?.ok && established.established === "link",
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={["left", "right"]} style={styles.flex}>
          <BackButton
            label="Sign In"
            onPress={() => void returnToSignIn(phase === "form" && sessionEstablishedFromLink)}
          />
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.title}>Reset password</Text>

          {phase === "checking" ? <LoadingState message="Checking your reset link…" /> : null}

          {phase === "invalid" ? (
            <View style={styles.form}>
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{banner ?? "This reset link is invalid or has expired."}</Text>
              </View>
              <Text style={styles.intro}>Send a new link to your email.</Text>
              <TextField
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                label="Email"
                onChangeText={setEmail}
                placeholder="you@example.com"
                textContentType="emailAddress"
                value={email}
              />
              {sent ? <Text style={styles.successText}>{PASSWORD_RESET_SENT_MESSAGE}</Text> : null}
              <Button disabled={!email.trim()} loading={sending} onPress={() => void sendAnotherLink()}>Send a new link</Button>
            </View>
          ) : null}

          {phase === "form" ? (
            <View style={styles.form}>
              <Text style={styles.intro}>Choose a new password for your account.</Text>
              <TextField
                autoCapitalize="none"
                autoComplete="new-password"
                label="New password"
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                textContentType="newPassword"
                value={password}
              />
              <TextField
                autoCapitalize="none"
                autoComplete="new-password"
                label="Confirm password"
                onChangeText={setConfirmPassword}
                onSubmitEditing={() => void updatePassword()}
                placeholder="Enter it again"
                secureTextEntry
                textContentType="newPassword"
                value={confirmPassword}
              />
              {banner ? <View style={styles.errorBanner}><Text style={styles.errorText}>{banner}</Text></View> : null}
              <Button disabled={!password || !confirmPassword} loading={submitting} onPress={() => void updatePassword()}>Update password</Button>
              <Button
                disabled={submitting}
                onPress={() => void returnToSignIn(sessionEstablishedFromLink)}
                variant="secondary"
              >
                Cancel
              </Button>
            </View>
          ) : null}

          {phase === "success" ? (
            <View style={styles.sent}>
              <View style={styles.confirmationIcon}><Text style={styles.confirmationGlyph}>✓</Text></View>
              <Text style={styles.sentCopy}>Your password has been updated.</Text>
              <Button onPress={() => void returnToSignIn(false)}>
                {signedIn ? "Continue" : "Back to Sign In"}
              </Button>
            </View>
          ) : null}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  centered: { alignItems: "center", flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
  successText: { color: colors.success, ...type.bodySmall },
  sent: { gap: spacing.lg, marginTop: spacing.xxl },
  confirmationIcon: { alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radii.pill, height: 64, justifyContent: "center", width: 64 },
  confirmationGlyph: { color: colors.success, fontFamily: fonts.bold, fontSize: 28 },
  sentCopy: { color: colors.inkSoft, ...type.body },
});
