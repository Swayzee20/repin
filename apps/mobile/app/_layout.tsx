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
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { ReservedRegionsProvider } from "react-native-reserved-regions";

import { normalizeInviteRedirect } from "../lib/invite-route";
import { isLayoutPreview } from "../lib/layout-preview";
import { useAuthSession } from "../lib/use-auth-session";
import { colors } from "../ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ReservedRegionsProvider style={styles.root}>
      <Stack
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      />
      <SignedOutRedirect />
      <StatusBar style="dark" />
    </ReservedRegionsProvider>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
});

const signedOutTabPaths = new Set(["/", "/community", "/profile"]);

function SignedOutRedirect() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ redirect?: string | string[] }>();
  const { ready, session } = useAuthSession();
  if (isLayoutPreview()) return null;
  if (!ready || session || !signedOutTabPaths.has(pathname)) return null;
  const inviteRedirect = normalizeInviteRedirect(params.redirect);
  return (
    <Redirect
      href={inviteRedirect ? { pathname: "/sign-in", params: { redirect: inviteRedirect } } : "/sign-in"}
    />
  );
}
