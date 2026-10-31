import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button, Lockup, StateCard, TextField } from "../ui/components";
import { colors, fonts, spacing, type } from "../ui/theme";

const wideContentMin = 600;
const signInFormMaxWidth = 420;

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInput = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const focusedField = useRef<"email" | "password" | null>(null);
  const contentWidth = width - insets.left - insets.right;
  const wide = contentWidth >= wideContentMin;
  const wideRef = useRef(wide);

  useEffect(() => {
    if (wideRef.current === wide) return;
    wideRef.current = wide;
    const field = focusedField.current;
    if (field === "email") emailInput.current?.focus();
    if (field === "password") passwordInput.current?.focus();
  }, [wide]);

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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <StateCard message="Add the Expo public Supabase URL and publishable key to the mobile environment file." title="Supabase is not configured" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={["left", "right"]} style={styles.flexGrow}>
            <View style={[styles.column, wide && styles.columnWide]}>
              <View style={styles.authIntro}>
                <Lockup />
                <Text style={styles.authTitle}>Welcome back</Text>
                <Text style={styles.authCopy}>Log in to your repin account.</Text>
              </View>
              <View style={styles.authForm}>
                <TextField
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  label="Email"
                  onBlur={() => {
                    if (focusedField.current === "email") focusedField.current = null;
                    setEmailFocused(false);
                  }}
                  onChangeText={setEmail}
                  onFocus={() => {
                    focusedField.current = "email";
                    setEmailFocused(true);
                  }}
                  placeholder="you@example.com"
                  ref={emailInput}
                  style={[styles.authInput, emailFocused && styles.authInputFocused]}
                  value={email}
                />
                <TextField
                  autoCapitalize="none"
                  autoComplete="password"
                  label="Password"
                  onBlur={() => {
                    if (focusedField.current === "password") focusedField.current = null;
                    setPasswordFocused(false);
                  }}
                  onChangeText={setPassword}
                  onFocus={() => {
                    focusedField.current = "password";
                    setPasswordFocused(true);
                  }}
                  placeholder="Enter your password"
                  ref={passwordInput}
                  secureTextEntry
                  style={[styles.authInput, passwordFocused && styles.authInputFocused]}
                  value={password}
                />
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push("/forgot-password")} style={styles.forgotPassword}>
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </Pressable>
                {authMessage ? <Text style={styles.error}>{authMessage}</Text> : null}
                <Button disabled={!email || !password} loading={submitting} onPress={() => void signIn()} style={styles.authButton}>Sign in</Button>
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
          </SafeAreaView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  scroll: { flexGrow: 1 },
  centered: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  column: { flexGrow: 1, padding: spacing.xxl },
  columnWide: { alignSelf: "center", maxWidth: signInFormMaxWidth, width: "100%" },
  authIntro: { alignItems: "flex-start", marginBottom: spacing.xxxl, marginTop: spacing.huge },
  authTitle: { color: colors.ink, ...type.display, marginTop: spacing.xxl },
  authCopy: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  authForm: { gap: spacing.lg },
  authInput: { borderRadius: 9 },
  authInputFocused: { borderColor: colors.brand },
  authButton: { borderRadius: 10 },
  error: { color: colors.danger, ...type.bodySmall },
  signupPrompt: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xxl },
  signupCopy: { color: colors.muted, ...type.bodySmall },
  signupLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  forgotPassword: { alignSelf: "flex-end" },
  forgotPasswordText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
});
