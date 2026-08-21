import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { normalizeInviteRedirect } from "../lib/invite-route";
import { BackButton, Button, StateCard, TextField } from "../ui/components";
import { colors, fonts, radii, spacing, type } from "../ui/theme";

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const returnToSignIn = useCallback(() => {
    router.replace({
      pathname: "/",
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

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <StateCard message="Add the Expo public Supabase URL and publishable key before creating an account." title="Supabase is not configured" />
          <Button onPress={returnToSignIn} variant="secondary">Back to Sign In</Button>
        </View>
      </SafeAreaView>
    );
  }

  if (confirmationEmail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.confirmationIcon}><Text style={styles.confirmationGlyph}>✓</Text></View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.confirmationCopy}>
            We sent a confirmation link to {confirmationEmail}. Confirm your account, then sign in to continue.
          </Text>
          <Button onPress={returnToSignIn} style={styles.fullWidth}>Back to Sign In</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <BackButton label="Sign In" onPress={returnToSignIn} />
          <Text style={styles.eyebrow}>JOIN REPIN</Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.intro}>Set up your profile, then find your community.</Text>

          <View style={styles.formCard}>
            <View style={styles.nameRow}>
              <View style={styles.nameField}><TextField autoComplete="given-name" label="First name" maxLength={60} onChangeText={setFirstName} placeholder="First name" textContentType="givenName" value={firstName} /></View>
              <View style={styles.nameField}><TextField autoComplete="family-name" label="Last name" maxLength={60} onChangeText={setLastName} placeholder="Last name" textContentType="familyName" value={lastName} /></View>
            </View>
            <TextField autoCapitalize="none" autoComplete="email" inputMode="email" label="Email" onChangeText={setEmail} placeholder="you@example.com" textContentType="emailAddress" value={email} />
            <TextField autoCapitalize="none" autoComplete="new-password" label="Password" onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry textContentType="newPassword" value={password} />
            <TextField autoCapitalize="none" autoComplete="new-password" label="Confirm password" onChangeText={setConfirmPassword} onSubmitEditing={() => void createAccount()} placeholder="Enter it again" secureTextEntry textContentType="newPassword" value={confirmPassword} />
            {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
            <Button disabled={!firstName || !lastName || !email || !password || !confirmPassword} loading={submitting} onPress={() => void createAccount()}>Create Account</Button>
          </View>

          <View style={styles.signinPrompt}>
            <Text style={styles.promptCopy}>Already have an account?</Text>
            <Button onPress={returnToSignIn} variant="secondary">Sign In</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 }, centered: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.sm },
  formCard: { gap: spacing.lg }, nameRow: { flexDirection: "row", gap: spacing.md }, nameField: { flex: 1 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md }, errorText: { color: colors.danger, ...type.bodySmall },
  signinPrompt: { gap: spacing.md, marginTop: spacing.xl }, promptCopy: { color: colors.muted, ...type.bodySmall, textAlign: "center" },
  confirmationIcon: { alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radii.pill, height: 64, justifyContent: "center", marginBottom: spacing.xl, width: 64 },
  confirmationGlyph: { color: colors.success, fontFamily: fonts.bold, fontSize: 28 }, confirmationCopy: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.md, maxWidth: 340, textAlign: "center" }, fullWidth: { alignSelf: "stretch" },
});
