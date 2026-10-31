import type { JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { Button, Card, LoadingState, StateCard, TextField } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import { colors, layout, size, spacing, type } from "../../ui/theme";

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
      <FlowFrame>
        <LoadingState message="Checking your account…" />
      </FlowFrame>
    );
  }

  if (!session) {
    return (
      <FlowFrame>
        <RoundIconButton accessibilityLabel="Get Started" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
        <StateCard
          actionLabel="Back to Sign In"
          message="Sign in again before using an invite code."
          onAction={() => router.replace("/sign-in")}
          title="Sign in required"
        />
      </FlowFrame>
    );
  }

  if (alreadyMemberGroup) {
    return (
      <FlowFrame>
        <RoundIconButton accessibilityLabel="Get Started" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
        <StateCard
          actionLabel="Continue to Home"
          message={`You’re already a member of ${alreadyMemberGroup}.`}
          onAction={() => router.replace("/")}
          title="You’re already in"
        />
      </FlowFrame>
    );
  }

  return (
    <FlowFrame
      action={(
        <Card style={styles.formCard}>
          <TextField
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            error={error}
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
          <Button
            disabled={!inviteCodePattern.test(inviteCode)}
            disabledReason={inviteCodePattern.test(inviteCode) ? undefined : "Enter an 8-character invite code."}
            loading={submitting}
            loadingLabel="Joining"
            onPress={() => void joinGroup()}
          >
            Join Group
          </Button>
        </Card>
      )}
    >
      <RoundIconButton accessibilityLabel="Get Started" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
      <Text style={styles.eyebrow}>JOIN YOUR CREW</Text>
      <Text style={styles.title}>Join a group</Text>
      <Text style={styles.intro}>
        Enter the invite code a group member shared with you.
      </Text>
    </FlowFrame>
  );
}

function FlowFrame({ action, children }: { action?: ReactNode; children: ReactNode }) {
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <TwoPane
          column="form"
          contentPaddingBottom={spacing.xxl}
          fallback={action ? "stack" : "hide-right"}
          keyboardShouldPersistTaps="handled"
          left={<View style={styles.pane}>{children}</View>}
          right={action ? <View style={twoPane ? styles.actionSplit : styles.actionStack}>{action}</View> : <View />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  actionSplit: { maxWidth: layout.formMax, paddingTop: size.hit + spacing.xl, width: "100%" },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  formCard: { gap: spacing.lg, padding: spacing.xl },
  codeInput: { ...type.title, letterSpacing: 3 },
});
