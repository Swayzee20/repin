import type { GroupPreview, JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import { BackButton, Button, TextField } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export default function JoinGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupPreview[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const requestId = useRef(0);

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

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentRequestId = ++requestId.current;

    if (normalizedQuery.length < 2 || !session) {
      setResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void fetch(`${apiUrl}/api/groups/search?q=${encodeURIComponent(normalizedQuery)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(7_500),
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            groups?: GroupPreview[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error ?? "Search failed.");
          if (currentRequestId === requestId.current) setResults(body.groups ?? []);
        })
        .catch((error: unknown) => {
          if (currentRequestId === requestId.current) {
            setResults([]);
            setSearchError(error instanceof Error ? error.message : "Search failed.");
          }
        })
        .finally(() => {
          if (currentRequestId === requestId.current) setSearchLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchRetry, session]);

  const findInvite = useCallback(async () => {
    if (!session || !inviteCode.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    setJoinError(null);
    setPreview(null);

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
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : "Invite code could not be checked.",
      );
    } finally {
      setInviteLoading(false);
    }
  }, [inviteCode, session]);

  const join = useCallback(async () => {
    if (!session || !preview || preview.isMember) return;
    setJoining(true);
    setJoinError(null);

    try {
      const response = await fetch(`${apiUrl}/api/groups/${preview.id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
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
  }, [params.onboarding, preview, router, session]);

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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} />
        <Text style={styles.eyebrow}>FIND YOUR CREW</Text>
        <Text style={styles.title}>Join a group</Text>
        <Text style={styles.intro}>
          Search by group name or enter an invite code shared by a group member.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search groups</Text>
          <TextField
            autoCapitalize="words"
            maxLength={80}
            onChangeText={(value) => {
              setQuery(value);
              setPreview(null);
              setJoinError(null);
            }}
            placeholder="Group name"
            returnKeyType="search"
            value={query}
          />
          {query.trim().length < 2 ? (
            <Text style={styles.muted}>Enter at least 2 characters to search.</Text>
          ) : searchLoading ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.muted}>Searching…</Text>
            </View>
          ) : searchError ? (
            <View style={styles.inlineState}>
              <Text style={styles.error}>{searchError}</Text>
              <Pressable onPress={() => setSearchRetry((value) => value + 1)}>
                <Text style={styles.link}>Try again</Text>
              </Pressable>
            </View>
          ) : results.length === 0 ? (
            <Text style={styles.muted}>No groups matched that name.</Text>
          ) : (
            <View style={styles.results}>
              {results.map((group) => (
                <Pressable
                  accessibilityRole="button"
                  key={group.id}
                  onPress={() => {
                    setPreview(group);
                    setJoinError(null);
                  }}
                  style={styles.resultRow}
                >
                  <View style={styles.resultCopy}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.muted}>{memberLabel(group.memberCount)}</Text>
                  </View>
                  <Text style={group.isMember ? styles.joinedLabel : styles.link}>
                    {group.isMember ? "Joined" : "View"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR USE AN INVITE CODE</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.section}>
          <View style={styles.inviteRow}>
            <TextField
              autoCapitalize="characters"
              autoCorrect={false}
              containerStyle={styles.inviteField}
              onChangeText={setInviteCode}
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
  inlineState: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  muted: { color: colors.muted, ...type.bodySmall, marginTop: spacing.sm },
  error: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
  link: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13 },
  results: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.md, overflow: "hidden" },
  resultRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 64, padding: spacing.lg },
  resultCopy: { flex: 1 },
  groupName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  joinedLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  dividerRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xxxl },
  divider: { backgroundColor: colors.borderStrong, flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { color: colors.subtle, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1 },
  inviteRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm },
  inviteField: { flex: 1, minWidth: 0 },
  compactButton: { minWidth: 80 },
  previewCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xxxl, padding: spacing.xl },
  previewLabel: { color: colors.brand, ...type.eyebrow },
  previewName: { color: colors.ink, ...type.title, marginTop: spacing.sm },
});
