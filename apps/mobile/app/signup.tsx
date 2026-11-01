import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { AuthScreen, AuthSuccessMark, FormError, usePaneFieldFocus } from "../ui/auth-screen";
import { Button, StateCard, TextField } from "../ui/components";
import { colors, spacing, type } from "../ui/theme";

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const fieldProps = usePaneFieldFocus();
  const returnToSignIn = useCallback(() => {
    router.replace({
      pathname: "/sign-in",
      params: inviteRedirect ? { redirect: inviteRedirect } : undefined,
    });
  }, [inviteRedirect, router]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const createAccount = useCallback(async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);

    if (!normalizedFirstName || !normalizedLastName) {
      setError("Enter your first and last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSubmitting(true);
    try {
      const displayName = `${normalizedFirstName} ${normalizedLastName}`;
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            display_name: displayName,
            first_name: normalizedFirstName,
            full_name: displayName,
            last_name: normalizedLastName,
          },
        },
      });

      if (signupError) throw signupError;
      if (data.session) {
        router.replace(inviteRedirect ?? "/");
      } else {
        setConfirmationEmail(normalizedEmail);
      }
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Account could not be created.");
    } finally {
      setSubmitting(false);
    }
  }, [confirmPassword, email, firstName, inviteRedirect, lastName, password, router]);

  let body = (
    <>
      <Text style={styles.eyebrow}>JOIN REPIN</Text>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.intro}>Set up your profile, then find your community.</Text>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <TextField
              autoComplete="given-name"
              label="First name"
              maxLength={60}
              onChangeText={setFirstName}
              placeholder="First name"
              textContentType="givenName"
              value={firstName}
              {...fieldProps("first")}
            />
          </View>
          <View style={styles.nameField}>
            <TextField
              autoComplete="family-name"
              label="Last name"
              maxLength={60}
              onChangeText={setLastName}
              placeholder="Last name"
              textContentType="familyName"
              value={lastName}
              {...fieldProps("last")}
            />
          </View>
        </View>
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          textContentType="emailAddress"
          value={email}
          {...fieldProps("email")}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="new-password"
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          {...fieldProps("password")}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="new-password"
          label="Confirm password"
          onChangeText={setConfirmPassword}
          onSubmitEditing={() => void createAccount()}
          placeholder="Enter it again"
          secureTextEntry
          textContentType="newPassword"
          value={confirmPassword}
          {...fieldProps("confirm")}
        />
        {error ? <FormError message={error} /> : null}
        <Button
          disabled={!firstName || !lastName || !email || !password || !confirmPassword}
          disabledReason={!firstName || !lastName ? "Enter your first and last name." : !email ? "Enter your email." : "Enter and confirm a password."}
          loading={submitting}
          loadingLabel="Creating account"
          onPress={() => void createAccount()}
        >
          Create Account
        </Button>
      </View>

      <View style={styles.signinPrompt}>
        <Text style={styles.promptCopy}>Already have an account?</Text>
        <Button onPress={returnToSignIn} variant="secondary">Sign In</Button>
      </View>
    </>
  );

  if (!isSupabaseConfigured) {
    body = (
      <StateCard
        actionLabel="Back to Sign In"
        message="Add the Expo public Supabase URL and publishable key before creating an account."
        onAction={returnToSignIn}
        title="Supabase is not configured"
      />
    );
  } else if (confirmationEmail) {
    body = (
      <View style={styles.confirmation}>
        <AuthSuccessMark />
        <Text style={styles.confirmationTitle}>Check your email</Text>
        <Text style={styles.confirmationCopy}>
          We sent a confirmation link to {confirmationEmail}. Confirm your account, then sign in to continue.
        </Text>
        <Button onPress={returnToSignIn} style={styles.fullWidth}>Back to Sign In</Button>
      </View>
    );
  }

  return (
    <AuthScreen backLabel="Sign In" onBack={returnToSignIn}>
      {body}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  nameRow: { flexDirection: "row", gap: spacing.md },
  nameField: { flex: 1 },
  signinPrompt: { gap: spacing.md, marginTop: spacing.xl },
  promptCopy: { color: colors.muted, ...type.bodySmall, textAlign: "center" },
  confirmation: { alignItems: "center", gap: spacing.lg, marginTop: spacing.xxl },
  confirmationTitle: { color: colors.ink, ...type.display, textAlign: "center" },
  confirmationCopy: { color: colors.muted, ...type.body, textAlign: "center" },
  fullWidth: { alignSelf: "stretch" },
});
