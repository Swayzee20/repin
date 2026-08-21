import type { JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import {
  BackButton,
  Button,
  LoadingState,
  StateCard,
  TextField,
} from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const inviteCodePattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export default function JoinFirstGroupScreen() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMemberGroup, setAlreadyMemberGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
  }, []);

  const joinGroup = useCallback(async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();
    setError(null);

    if (!inviteCodePattern.test(normalizedCode)) {
      setError("Enter the 8-character invite code from your crew.");
      return;
    }
    if (!session) {
      setError("Your session has ended. Sign in again to join a group.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/api/groups/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteCode: normalizedCode }),
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as JoinGroupResponse & { error?: string };

      if (response.status === 401) {
        setSession(null);
        throw new Error("Your session has ended. Sign in again to join a group.");
      }
      if (!response.ok || !body.group) {
        throw new Error(
          response.status === 404
            ? "That invite code isn’t valid. Check the code and try again."
            : (body.error ?? "Group could not be joined."),
        );
      }

      if (body.alreadyMember) {
        setAlreadyMemberGroup(body.group.name);
        return;
      }

      router.replace("/");
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Group could not be joined.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [inviteCode, router, session]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState message="Checking your account…" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <StateCard
            actionLabel="Back to Sign In"
            message="Sign in again before using an invite code."
            onAction={() => router.replace("/")}
            title="Sign in required"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyMemberGroup) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <StateCard
            actionLabel="Continue to Home"
            message={`You’re already a member of ${alreadyMemberGroup}.`}
            onAction={() => router.replace("/")}
            title="You’re already in"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <BackButton label="Get Started" onPress={() => router.back()} />
          <Text style={styles.eyebrow}>JOIN YOUR CREW</Text>
          <Text style={styles.title}>Join a group</Text>
          <Text style={styles.intro}>
            Enter the invite code a group member shared with you.
          </Text>

          <View style={styles.formCard}>
            <TextField
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              hint="Codes use eight letters and numbers."
              label="Invite code"
              maxLength={8}
              onChangeText={(value) => {
                setInviteCode(value.replace(/\s/g, "").toUpperCase());
                setError(null);
              }}
              onSubmitEditing={() => void joinGroup()}
              placeholder="ABC23XYZ"
              returnKeyType="join"
              style={styles.codeInput}
              value={inviteCode}
            />
            {error ? (
              <View accessibilityRole="alert" style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Button
              disabled={!inviteCodePattern.test(inviteCode)}
              loading={submitting}
              onPress={() => void joinGroup()}
            >
              Join Group
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  stateContainer: { flex: 1, justifyContent: "center", padding: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: {
    color: colors.muted,
    ...type.body,
    marginBottom: spacing.xxl,
    marginTop: spacing.sm,
  },
  formCard: { gap: spacing.lg },
  codeInput: { fontFamily: fonts.bold, fontSize: 21, letterSpacing: 3 },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, ...type.bodySmall },
});
