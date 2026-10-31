import type { GroupPreview, JoinGroupResponse } from "@repin/types";
import type { Session } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { invitePath, normalizeInviteCode } from "../../lib/invite-route";
import { supabase } from "../../lib/supabase";
import { Button, Card, LoadingState, StateCard } from "../../ui/components";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../ui/primitives";
import { colors, layout, radii, size, spacing, type } from "../../ui/theme";

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
    return <InviteScreen><LoadingState message="Opening invite…" /></InviteScreen>;
  }

  if (invalidInvite) {
    return (
      <InviteScreen>
        <StateCard
          actionLabel="Go to Home"
          message="This invite code isn’t valid. Ask the group for a new code and try again."
          onAction={() => router.replace("/")}
          title="Invalid invite"
        />
      </InviteScreen>
    );
  }

  if (!session && inviteCode) {
    const redirect = invitePath(inviteCode);
    return (
      <InviteScreen
        action={(
          <View style={styles.actions}>
            <Button onPress={() => router.push({ pathname: "/sign-in", params: { redirect } })}>
              Sign In to Continue
            </Button>
            <Button
              onPress={() => router.push({ pathname: "/signup", params: { redirect } })}
              variant="secondary"
            >
              Create Account
            </Button>
          </View>
        )}
      >
        <Text style={styles.eyebrow}>YOU’RE INVITED</Text>
        <Text style={styles.title}>Join your repin crew</Text>
        <Text style={styles.intro}>
          Sign in or create an account to view this group and accept the invite.
        </Text>
        <Card style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.code}>{inviteCode}</Text>
        </Card>
      </InviteScreen>
    );
  }

  if (inviteLoading && !preview) {
    return <InviteScreen><LoadingState message="Loading group invite…" /></InviteScreen>;
  }

  if (error && !preview) {
    return (
      <InviteScreen>
        <StateCard
          actionLabel="Try again"
          message={error}
          onAction={() => void loadInvite()}
          title="Invite unavailable"
        />
      </InviteScreen>
    );
  }

  if (!preview) return null;

  return (
    <InviteScreen
      action={(
        <View style={styles.actions}>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {preview.isMember ? (
            <>
              <Button onPress={() => router.replace(`/groups/${preview.id}`)}>
                Continue to Group
              </Button>
              <Button onPress={() => router.replace("/")} variant="secondary">
                Go to Home
              </Button>
            </>
          ) : (
            <Button loading={joining} loadingLabel="Joining" onPress={() => void joinGroup()}>
              Join Group
            </Button>
          )}
        </View>
      )}
    >
      <Text style={styles.eyebrow}>GROUP INVITE</Text>
      <Text style={styles.title}>{preview.name}</Text>
      <Text style={styles.intro}>
        {preview.isMember
          ? "You’re already part of this repin group."
          : "You’ve been invited to join this repin group."}
      </Text>
      <Card style={styles.groupCard}>
        <View style={styles.groupMark}>
          <Text style={styles.groupMarkText}>{preview.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.groupCopy}>
          <Text numberOfLines={1} style={styles.groupName}>{preview.name}</Text>
          <Text style={styles.memberCount}>{memberLabel(preview.memberCount)}</Text>
        </View>
      </Card>
    </InviteScreen>
  );
}

function InviteScreen({ action, children }: { action?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        column="form"
        contentPaddingBottom={spacing.xxl}
        fallback={action ? "stack" : "hide-right"}
        left={(
          <View style={styles.pane}>
            <RoundIconButton accessibilityLabel="Home" kind="back" onPress={() => router.replace("/")} style={roundNavButtonStyle} />
            {children}
          </View>
        )}
        right={action ? <View style={twoPane ? styles.actionSplit : styles.actionStack}>{action}</View> : <View />}
      />
    </SafeAreaView>
  );
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  codeCard: { marginTop: spacing.xxl },
  codeLabel: { color: colors.brandPressed, ...type.eyebrow },
  code: { color: colors.ink, ...type.title, letterSpacing: 3, marginTop: spacing.sm },
  groupCard: { alignItems: "center", flexDirection: "row", marginTop: spacing.xxl },
  groupMark: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    height: size.control,
    justifyContent: "center",
    width: size.control,
  },
  groupMarkText: { color: colors.surface, ...type.heading },
  groupCopy: { flex: 1, marginLeft: spacing.md },
  groupName: { color: colors.ink, ...type.heading },
  memberCount: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  actionSplit: { maxWidth: layout.formMax, paddingTop: size.hit + spacing.xl, width: "100%" },
  actionStack: { marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  actions: { gap: spacing.md },
  error: { color: colors.danger, ...type.bodySmall },
});
