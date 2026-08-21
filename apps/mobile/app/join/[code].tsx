import type { GroupPreview, JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { invitePath, normalizeInviteCode } from "../../lib/invite-route";
import { supabase } from "../../lib/supabase";
import { BackButton, Button, LoadingState, StateCard } from "../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export default function GroupInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const inviteCode = normalizeInviteCode(params.code);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [invalidInvite, setInvalidInvite] = useState(!inviteCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthLoading(false);
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  const loadInvite = useCallback(async () => {
    if (!session || !inviteCode) return;
    setInviteLoading(true);
    setInvalidInvite(false);
    setError(null);

    try {
      const response = await fetch(
        `${apiUrl}/api/groups/invite/${encodeURIComponent(inviteCode)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(7_500),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        group?: GroupPreview;
      };

      if (response.status === 401) {
        setSession(null);
        return;
      }
      if (response.status === 404 || response.status === 400) {
        setInvalidInvite(true);
        setPreview(null);
        return;
      }
      if (!response.ok || !body.group) {
        throw new Error(body.error ?? "Invite could not be loaded.");
      }

      setPreview(body.group);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Invite could not be loaded.",
      );
    } finally {
      setInviteLoading(false);
    }
  }, [inviteCode, session]);

  useEffect(() => {
    if (session && inviteCode) void loadInvite();
  }, [inviteCode, loadInvite, session]);

  const joinGroup = useCallback(async () => {
    if (!session || !inviteCode) return;
    setJoining(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/groups/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteCode }),
        signal: AbortSignal.timeout(7_500),
      });
      const body = (await response.json()) as JoinGroupResponse & { error?: string };

      if (response.status === 401) {
        setSession(null);
        return;
      }
      if (response.status === 404 || response.status === 400) {
        setInvalidInvite(true);
        setPreview(null);
        return;
      }
      if (!response.ok || !body.group) {
        throw new Error(body.error ?? "Group could not be joined.");
      }

      if (body.alreadyMember) {
        setPreview(body.group);
      } else {
        router.replace(`/groups/${body.group.id}`);
      }
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Group could not be joined.",
      );
    } finally {
      setJoining(false);
    }
  }, [inviteCode, router, session]);

  if (authLoading) {
    return <InviteShell><LoadingState message="Opening invite…" /></InviteShell>;
  }

  if (invalidInvite) {
    return (
      <InviteShell>
        <BackButton label="Home" onPress={() => router.replace("/")} />
        <StateCard
          actionLabel="Go to Home"
          message="This invite code isn’t valid. Ask the group for a new code and try again."
          onAction={() => router.replace("/")}
          title="Invalid invite"
        />
      </InviteShell>
    );
  }

  if (!session && inviteCode) {
    const redirect = invitePath(inviteCode);
    return (
      <InviteShell>
        <BackButton label="Home" onPress={() => router.replace("/")} />
        <Text style={styles.eyebrow}>YOU’RE INVITED</Text>
        <Text style={styles.title}>Join your RepIn crew</Text>
        <Text style={styles.intro}>
          Sign in or create an account to view this group and accept the invite.
        </Text>
        <View style={styles.codePanel}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.code}>{inviteCode}</Text>
        </View>
        <View style={styles.actions}>
          <Button
            onPress={() => router.push({ pathname: "/", params: { redirect } })}
          >
            Sign In to Continue
          </Button>
          <Button
            onPress={() => router.push({ pathname: "/signup", params: { redirect } })}
            variant="secondary"
          >
            Create Account
          </Button>
        </View>
      </InviteShell>
    );
  }

  if (inviteLoading && !preview) {
    return <InviteShell><LoadingState message="Loading group invite…" /></InviteShell>;
  }

  if (error && !preview) {
    return (
      <InviteShell>
        <BackButton label="Home" onPress={() => router.replace("/")} />
        <StateCard
          actionLabel="Try again"
          message={error}
          onAction={() => void loadInvite()}
          title="Invite unavailable"
        />
      </InviteShell>
    );
  }

  if (!preview) return null;

  return (
    <InviteShell>
      <BackButton label="Home" onPress={() => router.replace("/")} />
      <Text style={styles.eyebrow}>GROUP INVITE</Text>
      <Text style={styles.title}>{preview.name}</Text>
      <Text style={styles.intro}>
        {preview.isMember
          ? "You’re already part of this RepIn group."
          : "You’ve been invited to join this RepIn group."}
      </Text>
      <View style={styles.groupPanel}>
        <View style={styles.groupMark}>
          <Text style={styles.groupMarkText}>{preview.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.groupCopy}>
          <Text numberOfLines={1} style={styles.groupName}>{preview.name}</Text>
          <Text style={styles.memberCount}>{memberLabel(preview.memberCount)}</Text>
        </View>
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {preview.isMember ? (
          <>
            <Button onPress={() => router.replace(`/groups/${preview.id}`)}>
              Continue to Group
            </Button>
            <Button onPress={() => router.replace("/")} variant="quiet">
              Go to Home
            </Button>
          </>
        ) : (
          <Button loading={joining} onPress={() => void joinGroup()}>
            Join Group
          </Button>
        )}
      </View>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>
    </SafeAreaView>
  );
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  codePanel: { backgroundColor: colors.brandSoft, borderColor: colors.boardBorder, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xxxl, padding: spacing.lg },
  codeLabel: { color: colors.brandPressed, ...type.eyebrow },
  code: { color: colors.ink, fontFamily: fonts.bold, fontSize: 24, letterSpacing: 3, marginTop: spacing.sm },
  groupPanel: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", marginTop: spacing.xxxl, paddingVertical: spacing.lg },
  groupMark: { alignItems: "center", backgroundColor: colors.brand, borderRadius: radii.lg, height: 48, justifyContent: "center", width: 48 },
  groupMarkText: { color: colors.surface, fontFamily: fonts.bold, fontSize: 20 },
  groupCopy: { flex: 1, marginLeft: spacing.md },
  groupName: { color: colors.ink, ...type.heading },
  memberCount: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  actions: { gap: spacing.md, marginTop: spacing.xxxl },
  error: { color: colors.danger, ...type.bodySmall, marginTop: spacing.lg },
});
