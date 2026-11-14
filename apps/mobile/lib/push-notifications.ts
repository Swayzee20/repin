import Constants from "expo-constants";
import { Platform } from "react-native";

import type { PushPlatform } from "@repin/validation";

import { supabase } from "./supabase";
import { registerDevicePushToken, unregisterDevicePushToken } from "./push-api";
import { pushUnregisterLog, resolvePushUnregisterToken } from "./push-unregister";
import {
  clearPendingPushUnregisterToken,
  readPendingPushUnregisterToken,
  writePendingPushUnregisterToken,
} from "./push-unregister-store";

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

async function unregisterStoredToken(
  token: string,
  accessToken: string,
  kind: "failed" | "retry-failed",
) {
  try {
    await unregisterDevicePushToken({
      accessToken,
      expoPushToken: token,
    });
    await clearPendingPushUnregisterToken();
  } catch {
    await writePendingPushUnregisterToken(token);
    console.info(pushUnregisterLog(kind));
  }
}

export async function removePushTokenForSession(accessToken?: string | null) {
  const pending = await readPendingPushUnregisterToken();
  const token = resolvePushUnregisterToken(cachedToken, pending);
  cachedToken = null;
  if (!token) return;
  if (!accessToken) {
    await writePendingPushUnregisterToken(token);
    console.info(pushUnregisterLog("deferred"));
    return;
  }
  await unregisterStoredToken(token, accessToken, "failed");
}

export async function retryPendingPushTokenRemoval(accessToken?: string | null) {
  const token = await readPendingPushUnregisterToken();
  if (!token || !accessToken) return;
  await unregisterStoredToken(token, accessToken, "retry-failed");
}

export function readCachedPushToken() {
  return cachedToken;
}
