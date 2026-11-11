import { Redirect, useGlobalSearchParams } from "expo-router";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isLayoutPreview } from "../lib/layout-preview";
import { useAuthSession } from "../lib/use-auth-session";
import { colors } from "./theme";

export function MainTabsGate({ children }: { children: ReactNode }) {
  const params = useGlobalSearchParams<{ redirect?: string | string[] }>();
  const { ready, session } = useAuthSession();
  const inviteRedirect = normalizeInviteRedirect(params.redirect);

  const layoutPreview = __DEV__ && isLayoutPreview();
  if (!ready && !layoutPreview) return <View style={styles.fill} />;
  if (!session && !layoutPreview) {
    return (
      <Redirect
        href={inviteRedirect ? { pathname: "/sign-in", params: { redirect: inviteRedirect } } : "/sign-in"}
      />
    );
  }

  return <View style={styles.fill}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.background, flex: 1 },
});
