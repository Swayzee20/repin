import Constants from "expo-constants";
import { Platform } from "react-native";

import type { PushPlatform } from "@repin/validation";

import { supabase } from "./supabase";
import { registerDevicePushToken, unregisterDevicePushToken } from "./push-api";

let cachedToken: string | null = null;

function nativePushSupported() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

function pushPlatform(): PushPlatform {
  return Platform.OS === "android" ? "android" : Platform.OS === "web" ? "web" : "ios";
}

function easProjectId() {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId?.trim();
  return projectId || null;
}

export async function getPushPermissionStatus() {
  if (!nativePushSupported()) return "undetermined" as const;
  const Notifications = await import("expo-notifications");
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return "granted" as const;
  if (!settings.canAskAgain) return "denied" as const;
  return "undetermined" as const;
}

export async function requestPushPermission() {
  if (!nativePushSupported()) return "undetermined" as const;
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const settings = await Notifications.requestPermissionsAsync();
  if (settings.granted) return "granted" as const;
  if (!settings.canAskAgain) return "denied" as const;
  return "undetermined" as const;
}

export async function syncPushTokenForSession() {
  if (!nativePushSupported() || !supabase) return;
  const status = await getPushPermissionStatus();
  if (status !== "granted") return;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return;

  const Notifications = await import("expo-notifications");
  const projectId = easProjectId();
  if (typeof projectId !== "string" || !projectId) return;

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    cachedToken = token.data;
    await registerDevicePushToken({
      accessToken: data.session.access_token,
      expoPushToken: token.data,
      platform: pushPlatform(),
    });
  } catch (error) {
    console.info("[push] token registration skipped", error);
  }
}

export async function removePushTokenForSession(accessToken?: string | null) {
  const token = cachedToken;
  cachedToken = null;
  if (!token || !accessToken) return;
  try {
    await unregisterDevicePushToken({
      accessToken,
      expoPushToken: token,
    });
  } catch (error) {
    console.info("[push] token removal skipped", error);
  }
}

export function readCachedPushToken() {
  return cachedToken;
}
