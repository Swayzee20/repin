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
import { Platform, StyleSheet } from "react-native";
import { ReservedRegionsProvider } from "../ui/reserved-regions";
import { RootErrorBoundary } from "../ui/root-error-boundary";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isLayoutPreview } from "../lib/layout-preview";
import { useAuthSession } from "../lib/use-auth-session";
import { useLayoutMode } from "../ui/layout";
import { formPresentation } from "../ui/layout-math";
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
        <RootStack />
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
 * Workout forms slide up from the bottom. An unfolded iPhone (iOS, not iPad,
 * two-pane) presents `fullScreenModal` so the preview pane is not clipped by
 * the page sheet. Folded phones, iPhone portrait, iPad, Android, and web stay
 * `modal`. The navigator reads `presentation` when the form is presented;
 * folding or unfolding while it is open does not re-present it. Close stays
 * the top-left X — a full-screen modal has no swipe-down dismiss.
 */
const formModalOptions = {
  animation: "slide_from_bottom",
  contentStyle: { backgroundColor: colors.background },
  headerShown: false,
  presentation: "modal",
} as const;

function RootStack() {
  const { mode } = useLayoutMode();
  const isPad = Platform.OS === "ios" && Platform.isPad;
  const presentation = formPresentation({
    isPad,
    mode,
    os: Platform.OS,
  });

  return (
    <Stack
      screenOptions={{
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="groups/[id]/log-workout" options={{ ...formModalOptions, presentation }} />
      <Stack.Screen name="groups/[id]/detailed-workout" options={{ ...formModalOptions, presentation }} />
      <Stack.Screen name="groups/[id]/workouts/[sessionId]/edit" options={{ ...formModalOptions, presentation }} />
    </Stack>
  );
}

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
