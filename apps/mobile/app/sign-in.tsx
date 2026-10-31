import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View, type TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import repinMarkLarge from "../assets/branding/repin-mark-large.png";
import { normalizeInviteRedirect } from "../lib/invite-route";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button, Lockup, StateCard, TextField, Wordmark } from "../ui/components";
import { TwoPane, useLayoutMode } from "../ui/layout";
import { colors, fonts, layout, radii, spacing, type } from "../ui/theme";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLayoutMode();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInput = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const focusedField = useRef<"email" | "password" | null>(null);
  const ignoreBlur = useRef(false);
  const modeRef = useRef(mode);
  const twoPane = mode === "twoPane";

  if (modeRef.current !== mode) {
    modeRef.current = mode;
    ignoreBlur.current = true;
  }

  useEffect(() => {
    const field = focusedField.current;
    const frame = requestAnimationFrame(() => {
      if (field === "email") emailInput.current?.focus();
      if (field === "password") passwordInput.current?.focus();
      requestAnimationFrame(() => {
        ignoreBlur.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    setSubmitting(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    router.replace(inviteRedirect ?? "/");
  }, [email, inviteRedirect, password, router]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.centered}>
          <StateCard message="Add the Expo public Supabase URL and publishable key to the mobile environment file." title="Supabase is not configured" />
        </View>
      </View>
    );
  }

  const form = (
    <View style={[styles.formColumn, twoPane && { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top + spacing.huge }]}>
      <View style={styles.authIntro}>
        {twoPane ? null : <Lockup />}
        <Text style={[styles.authTitle, twoPane && styles.authTitleFlush]}>Welcome back</Text>
        <Text style={styles.authCopy}>Log in to your repin account.</Text>
      </View>
      <View style={styles.authForm}>
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          label="Email"
          onBlur={() => {
            if (ignoreBlur.current) return;
            if (focusedField.current === "email") focusedField.current = null;
          }}
          onChangeText={setEmail}
          onFocus={() => {
            focusedField.current = "email";
          }}
          placeholder="you@example.com"
          ref={emailInput}
          value={email}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="password"
          label="Password"
          onBlur={() => {
            if (ignoreBlur.current) return;
            if (focusedField.current === "password") focusedField.current = null;
          }}
          onChangeText={setPassword}
          onFocus={() => {
            focusedField.current = "password";
          }}
          placeholder="Enter your password"
          ref={passwordInput}
          secureTextEntry
          value={password}
        />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push("/forgot-password")} style={styles.forgotPassword}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </Pressable>
        {authMessage ? <Text style={styles.error}>{authMessage}</Text> : null}
        <Button disabled={!email || !password} disabledReason={!email && !password ? "Enter your email and password." : !email ? "Enter your email." : !password ? "Enter your password." : undefined} loading={submitting} loadingLabel="Signing in" onPress={() => void signIn()} style={styles.authButton}>Sign in</Button>
      </View>
      <View style={styles.signupPrompt}>
        <Text style={styles.signupCopy}>Don’t have an account?</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push({ pathname: "/signup", params: inviteRedirect ? { redirect: inviteRedirect } : undefined })}
        >
          <Text style={styles.signupLink}>Create account</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={twoPane ? [] : ["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        bleedLeading
        column="form"
        fallback="hide-left"
        keyboardShouldPersistTaps="handled"
        leadingFill={colors.surfaceMuted}
        left={<BrandPanel />}
        right={form}
      />
    </SafeAreaView>
  );
}

function BrandPanel() {
  const { height } = useWindowDimensions();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.brandPanel, { minHeight: height }]}>
      <Image accessible={false} resizeMode="contain" source={repinMarkLarge} style={styles.brandMark} />
      <Wordmark decorative size={40} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  centered: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  brandPanel: { alignItems: "center", flexGrow: 1, justifyContent: "center", padding: spacing.xxl },
  brandMark: { height: 96, marginBottom: spacing.lg, width: 118 },
  formColumn: { flexGrow: 1, maxWidth: layout.formMax, paddingBottom: spacing.xxl, paddingTop: spacing.xxl + spacing.huge, width: "100%" },
  authIntro: { alignItems: "flex-start", marginBottom: spacing.xxxl },
  authTitle: { color: colors.ink, ...type.display, marginTop: spacing.xxl },
  authTitleFlush: { marginTop: 0 },
  authCopy: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  authForm: { gap: spacing.lg },
  authButton: { borderRadius: radii.md },
  error: { color: colors.danger, ...type.bodySmall },
  signupPrompt: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xxl },
  signupCopy: { color: colors.muted, ...type.bodySmall },
  signupLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  forgotPassword: { alignSelf: "flex-end" },
  forgotPasswordText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
});
