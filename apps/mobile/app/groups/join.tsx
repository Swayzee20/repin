import type { GroupPreview, JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { Button, Card, LoadingState, StateCard, TextField } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, layout, size, spacing, type } from "../../ui/theme";
import { useStripState } from "../../ui/vertical-bar-edge";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export default function JoinGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

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

  const findInvite = useCallback(async () => {
    if (!session || !inviteCode.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    setJoinError(null);
    setPreview(null);
    setPreviewCode(null);

    try {
      const response = await fetch(
        `${apiUrl}/api/groups/invite/${encodeURIComponent(inviteCode.trim())}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(7_500),
        },
      );
      const body = (await response.json()) as { group?: GroupPreview; error?: string };
      if (!response.ok || !body.group) {
        throw new Error(body.error ?? "Invite code is invalid or expired.");
      }
      setPreview(body.group);
      setPreviewCode(inviteCode.trim());
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : "Invite code could not be checked.",
      );
    } finally {
      setInviteLoading(false);
    }
  }, [inviteCode, session]);

  const join = useCallback(async () => {
    if (!session || !preview || !previewCode || preview.isMember) return;
    setJoining(true);
    setJoinError(null);

    try {
      const response = await fetch(`${apiUrl}/api/groups/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteCode: previewCode }),
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as JoinGroupResponse & { error?: string };
      if (!response.ok || !body.group) {
        throw new Error(body.error ?? "Group could not be joined.");
      }
      if (params.onboarding === "1") {
        router.replace("/");
      } else {
        router.replace(`./${body.group.id}`);
      }
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Group could not be joined.",
      );
    } finally {
      setJoining(false);
    }
  }, [params.onboarding, preview, previewCode, router, session]);

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
        {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
        <StateCard
          actionLabel="Back to Home"
          message="Sign in from Home before joining a group."
          onAction={() => router.back()}
          title="Sign in required"
        />
      </FlowFrame>
    );
  }

  return (
    <FlowFrame
      action={(
        <View style={styles.form}>
          <Card style={styles.formCard}>
            <TextField
              autoCapitalize="characters"
              autoCorrect={false}
              error={inviteError}
              label="Invite code"
              onChangeText={(value) => {
                setInviteCode(value);
                setPreview(null);
                setPreviewCode(null);
                setInviteError(null);
                setJoinError(null);
              }}
              onSubmitEditing={() => void findInvite()}
              placeholder="Invite code"
              value={inviteCode}
            />
            <Button
              disabled={inviteLoading || !inviteCode.trim()}
              disabledReason={inviteCode.trim() ? undefined : "Enter an invite code."}
              loading={inviteLoading}
              loadingLabel="Finding"
              onPress={() => void findInvite()}
            >
              Find
            </Button>
          </Card>
          {preview ? (
            <Card style={styles.previewCard}>
              <Text style={styles.previewLabel}>GROUP PREVIEW</Text>
              <Text style={styles.previewName}>{preview.name}</Text>
              <Text style={styles.muted}>{memberLabel(preview.memberCount)}</Text>
              <Button
                disabled={joining || preview.isMember}
                disabledReason={preview.isMember ? "You’re already in this group." : undefined}
                loading={joining}
                loadingLabel="Joining"
                onPress={() => void join()}
                variant={preview.isMember ? "secondary" : "primary"}
              >
                {preview.isMember ? "Already joined" : "Join Group"}
              </Button>
              {joinError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{joinError}</Text> : null}
            </Card>
          ) : null}
        </View>
      )}
    >
      {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
      <Text style={styles.eyebrow}>FIND YOUR CREW</Text>
      <Text style={styles.title}>Join a group</Text>
      <Text style={styles.intro}>
        Enter the invite code a member shared with you, or open their invite link.
      </Text>
    </FlowFrame>
  );
}

function FlowFrame({ action, children }: { action?: ReactNode; children: ReactNode }) {
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}
        >
          <TwoPane
            column="form"
            contentPaddingBottom={spacing.xxl}
            fallback={action ? "stack" : "hide-right"}
            keyboardShouldPersistTaps="handled"
            left={<View style={styles.pane}>{children}</View>}
            right={action ? (
              <View style={twoPane ? (roundBack ? [styles.actionSplit, styles.actionSplitOffset] : styles.actionSplit) : styles.actionStack}>
                {action}
              </View>
            ) : <View />}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  actionSplit: { maxWidth: layout.formMax, width: "100%" },
  actionSplitOffset: { paddingTop: size.hit + spacing.xl },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  form: { gap: spacing.lg },
  formCard: { gap: spacing.lg, padding: spacing.xl },
  previewCard: { gap: spacing.sm, padding: spacing.xl },
  previewLabel: { color: colors.brand, ...type.eyebrow },
  previewName: { color: colors.ink, ...type.title },
  muted: { color: colors.muted, ...type.bodySmall },
  error: { color: colors.danger, ...type.bodySmall },
});
