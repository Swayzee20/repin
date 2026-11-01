import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { isEmailAddress, PASSWORD_RESET_SENT_MESSAGE, requestPasswordReset } from "../lib/password-reset";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { AuthScreen, AuthSuccessMark, usePaneFieldFocus } from "../ui/auth-screen";
import { Button, StateCard, TextField } from "../ui/components";
import { colors, spacing, type } from "../ui/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const fieldProps = usePaneFieldFocus();
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
      <AuthScreen backLabel="Sign In" onBack={returnToSignIn}>
        <StateCard
          actionLabel="Back to Sign In"
          message="Add the Expo public Supabase URL and publishable key before resetting a password."
          onAction={returnToSignIn}
          title="Supabase is not configured"
        />
      </AuthScreen>
    );
  }

  const body = sent ? (
    <View style={styles.sent}>
      <AuthSuccessMark />
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
        error={error}
        inputMode="email"
        label="Email"
        onChangeText={setEmail}
        onSubmitEditing={() => void sendReset()}
        placeholder="you@example.com"
        textContentType="emailAddress"
        value={email}
        {...fieldProps("email")}
      />
      <Button
        disabled={!email.trim()}
        disabledReason={email.trim() ? undefined : "Enter your email."}
        loading={submitting}
        loadingLabel="Sending link"
        onPress={() => void sendReset()}
      >
        Send reset link
      </Button>
    </View>
  );

  return (
    <AuthScreen backLabel="Sign In" onBack={returnToSignIn}>
      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <Text style={styles.title}>Forgot password?</Text>
      {body}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  sent: { gap: spacing.lg, marginTop: spacing.xxl },
  sentCopy: { color: colors.inkSoft, ...type.body },
});
