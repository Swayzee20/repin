import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  GUIDELINES_LINK_LABEL,
  GUIDELINES_URL,
  TERMS_LINK_LABEL,
  TERMS_URL,
  agreeLineLinkPressedText,
  agreeLineLinkText,
  agreeLineSubmitGap,
  agreeLineText,
  agreeLinkHitSlop,
  signupAuthMetadata,
  termsAcceptanceSlot,
} from "../lib/terms-acceptance";
import { AuthScreen, AuthSuccessMark, FormError, usePaneFieldFocus } from "../ui/auth-screen";
import { fieldChainProps } from "../ui/keyboard";
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
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: signupAuthMetadata({
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
          }),
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

  const fields = ["first", "last", "email", "password", "confirm"] as const;
  const chain = (name: (typeof fields)[number]) => {
    const index = fields.indexOf(name);
    const next = fields[index + 1];
    return fieldChainProps({
      count: fields.length,
      index,
      last: "go",
      onAdvance: () => {
        if (next) fieldProps.focus(next);
      },
      onFinish: () => void createAccount(),
    });
  };

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
              {...chain("first")}
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
              {...chain("last")}
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
          {...chain("email")}
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
          {...chain("password")}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="new-password"
          label="Confirm password"
          onChangeText={setConfirmPassword}
          placeholder="Enter it again"
          secureTextEntry
          textContentType="newPassword"
          value={confirmPassword}
          {...fieldProps("confirm")}
          {...chain("confirm")}
        />
        {error ? <FormError message={error} /> : null}
        <View style={styles.submit}>
          <SignupAgreeLine />
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

function SignupAgreeLine() {
  return (
    <Text style={styles.agree} testID={termsAcceptanceSlot}>
      By creating an account, you agree to repin's{" "}
      <AgreeLink label={TERMS_LINK_LABEL} url={TERMS_URL}>
        Terms of Service
      </AgreeLink>
      {" and "}
      <AgreeLink label={GUIDELINES_LINK_LABEL} url={GUIDELINES_URL}>
        Community Guidelines
      </AgreeLink>
      .
    </Text>
  );
}

function AgreeLink({
  children,
  label,
  url,
}: {
  children: string;
  label: string;
  url: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      hitSlop={agreeLinkHitSlop}
      onPress={() => {
        void Linking.openURL(url);
      }}
    >
      {({ pressed }) => (
        <Text accessible={false} style={[styles.link, pressed && styles.linkPressed]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  nameRow: { flexDirection: "row", gap: spacing.md },
  nameField: { flex: 1 },
  submit: { alignSelf: "stretch", gap: agreeLineSubmitGap },
  agree: { alignSelf: "stretch", textAlign: "left", ...agreeLineText },
  link: agreeLineLinkText,
  linkPressed: agreeLineLinkPressedText,
  signinPrompt: { gap: spacing.md, marginTop: spacing.xl },
  promptCopy: { color: colors.muted, ...type.bodySmall, textAlign: "center" },
  confirmation: { alignItems: "center", gap: spacing.lg, marginTop: spacing.xxl },
  confirmationTitle: { color: colors.ink, ...type.display, textAlign: "center" },
  confirmationCopy: { color: colors.muted, ...type.body, textAlign: "center" },
  fullWidth: { alignSelf: "stretch" },
});
