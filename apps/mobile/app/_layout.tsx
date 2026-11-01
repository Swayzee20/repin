import { Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/nunito";
import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { ReservedRegionsProvider } from "../ui/reserved-regions";
import { RootErrorBoundary } from "../ui/root-error-boundary";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isLayoutPreview } from "../lib/layout-preview";
import { useAuthSession } from "../lib/use-auth-session";
import { colors } from "../ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const fontGateMs = 2_500;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [fontGateOpen, setFontGateOpen] = useState(false);
  const showApp = fontsLoaded || Boolean(fontError) || fontGateOpen;

  useEffect(() => {
    const timer = setTimeout(() => setFontGateOpen(true), fontGateMs);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (showApp) SplashScreen.hideAsync().catch(() => {});
  }, [showApp]);

  if (!showApp) return null;

  return (
    <RootErrorBoundary>
      <ReservedRegionsProvider style={styles.root}>
        <Stack
          screenOptions={{
            animation: "slide_from_right",
            contentStyle: { backgroundColor: colors.background },
            headerShown: false,
          }}
        >
          <Stack.Screen name="groups/[id]/log-workout" options={formModalOptions} />
          <Stack.Screen name="groups/[id]/detailed-workout" options={formModalOptions} />
          <Stack.Screen name="groups/[id]/workouts/[sessionId]/edit" options={formModalOptions} />
        </Stack>
        <SignedOutRedirect />
        <StatusBar style="dark" />
      </ReservedRegionsProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
});

/**
 * Workout forms present as a modal (D3). The close control stays top-left:
 * the Duo strip is the system vertical status bar, and nothing in this stack
 * shows that bar remaining a hittable slot above `presentation: "modal"`.
 */
const formModalOptions = {
  animation: "slide_from_bottom",
  contentStyle: { backgroundColor: colors.background },
  headerShown: false,
  presentation: "modal",
} as const;

const signedOutTabPaths = new Set(["/", "/community", "/profile"]);

function SignedOutRedirect() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ redirect?: string | string[] }>();
  const { ready, session } = useAuthSession();
  if (__DEV__ && isLayoutPreview()) return null;
  if (!ready || session || !signedOutTabPaths.has(pathname)) return null;
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  return (
    <Redirect
      href={inviteRedirect ? { pathname: "/sign-in", params: { redirect: inviteRedirect } } : "/sign-in"}
    />
  );
}
