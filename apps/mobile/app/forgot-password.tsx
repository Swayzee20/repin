import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { isEmailAddress, PASSWORD_RESET_SENT_MESSAGE, requestPasswordReset } from "../lib/password-reset";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { BackButton, Button, StateCard, TextField } from "../ui/components";
import { colors, fonts, radii, spacing, type } from "../ui/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const returnToSignIn = useCallback(() => {
    router.replace("/sign-in");
  }, [router]);

  const sendReset = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    if (!isEmailAddress(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSubmitting(true);
    const result = await requestPasswordReset(supabase, normalizedEmail);
    setSubmitting(false);
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    setSent(true);
  }, [email]);

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <StateCard message="Add the Expo public Supabase URL and publishable key before resetting a password." title="Supabase is not configured" />
          <Button onPress={returnToSignIn} variant="secondary">Back to Sign In</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={["left", "right"]} style={styles.flex}>
          <BackButton label="Sign In" onPress={returnToSignIn} />
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.title}>Forgot password?</Text>
          {sent ? (
            <View style={styles.sent}>
              <View style={styles.confirmationIcon}><Text style={styles.confirmationGlyph}>✓</Text></View>
              <Text style={styles.sentCopy}>{PASSWORD_RESET_SENT_MESSAGE}</Text>
              <Button onPress={returnToSignIn}>Back to Sign In</Button>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.intro}>
                Enter your email and we’ll send a link to choose a new password.
              </Text>
              <TextField
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                label="Email"
                onChangeText={setEmail}
                onSubmitEditing={() => void sendReset()}
                placeholder="you@example.com"
                textContentType="emailAddress"
                value={email}
              />
              {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
              <Button disabled={!email.trim()} loading={submitting} onPress={() => void sendReset()}>Send reset link</Button>
            </View>
          )}
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
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
  sent: { gap: spacing.lg, marginTop: spacing.xxl },
  confirmationIcon: { alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radii.pill, height: 64, justifyContent: "center", width: 64 },
  confirmationGlyph: { color: colors.success, fontFamily: fonts.bold, fontSize: 28 },
  sentCopy: { color: colors.inkSoft, ...type.body },
});
