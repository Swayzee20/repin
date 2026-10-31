import type { GroupPreview, JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { BackButton, Button, TextField } from "../../ui/components";
import { WideColumn } from "../../ui/layout";
import { colors, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export default function JoinGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
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
    return <CenteredState message="Checking your account…" />;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.muted}>Sign in from Home before joining a group.</Text>
          <Button onPress={() => router.back()}>Back to Home</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={["left", "right"]}>
        <WideColumn max="form">
        <BackButton onPress={() => router.back()} />
        <Text style={styles.eyebrow}>FIND YOUR CREW</Text>
        <Text style={styles.title}>Join a group</Text>
        <Text style={styles.intro}>
          Enter the invite code a member shared with you, or open their invite link.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite code</Text>
          <View style={styles.inviteRow}>
            <TextField
              autoCapitalize="characters"
              autoCorrect={false}
              containerStyle={styles.inviteField}
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
              loading={inviteLoading}
              onPress={() => void findInvite()}
              style={styles.compactButton}
            >
              Find
            </Button>
          </View>
          {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}
        </View>

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>GROUP PREVIEW</Text>
            <Text style={styles.previewName}>{preview.name}</Text>
            <Text style={styles.muted}>{memberLabel(preview.memberCount)}</Text>
            <Button
              disabled={joining || preview.isMember}
              loading={joining}
              onPress={() => void join()}
              variant={preview.isMember ? "secondary" : "primary"}
            >
              {preview.isMember ? "Already joined" : "Join Group"}
            </Button>
            {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
          </View>
        ) : null}
        </WideColumn>
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function CenteredState({ message }: { message: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.muted}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  container: { padding: spacing.xxl, paddingBottom: 72 },
  centered: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  section: { marginTop: spacing.xxxl },
  sectionTitle: { color: colors.inkSoft, ...type.label, marginBottom: spacing.sm },
  muted: { color: colors.muted, ...type.bodySmall, marginTop: spacing.sm },
  error: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
  inviteRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm },
  inviteField: { flex: 1, minWidth: 0 },
  compactButton: { minWidth: 80 },
  previewCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xxxl, padding: spacing.xl },
  previewLabel: { color: colors.brand, ...type.eyebrow },
  previewName: { color: colors.ink, ...type.title, marginTop: spacing.sm },
});
