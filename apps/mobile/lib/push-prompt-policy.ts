export type PushOsStatus = "undetermined" | "granted" | "denied";
export type OverlayPlatform = "ios" | "android" | "web";

export type PushHandoffAction = "preprompt" | "openSettings" | "syncToken";

export function nextPushHandoffAction(status: PushOsStatus): PushHandoffAction {
  if (status === "granted") return "syncToken";
  if (status === "denied") return "openSettings";
  return "preprompt";
}

export function canStartPrompt(input: {
  promptLocked: boolean;
  sheetVisible: boolean;
}) {
  return !input.promptLocked && !input.sheetVisible;
}

export function launchPromptAllowedOnPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (
    path === "/sign-in"
    || path === "/signup"
    || path === "/forgot-password"
    || path === "/reset-password"
    || path === "/groups/join"
    || path.startsWith("/join/")
    || path === "/onboarding/join-group"
    || path === "/onboarding/create-group"
  ) {
    return false;
  }
  return true;
}

export function shouldLaunchExistingMemberPrompt(input: {
  dismissed: boolean | null;
  generation: number;
  membership: boolean | null | "pending";
  overlayCount: number;
  osStatus: PushOsStatus | null;
  pathname: string;
  platform: OverlayPlatform;
  promptLocked: boolean;
  responseGeneration: number;
  sessionUserId: string | null;
  sheetVisible: boolean;
}) {
  if (input.platform === "web") return false;
  if (!input.sessionUserId) return false;
  if (input.generation !== input.responseGeneration) return false;
  if (!launchPromptAllowedOnPath(input.pathname)) return false;
  if (input.osStatus == null || input.osStatus !== "undetermined") return false;
  if (input.dismissed == null || input.dismissed) return false;
  if (input.membership !== true) return false;
  if (input.overlayCount > 0) return false;
  if (!canStartPrompt(input)) return false;
  return true;
}

export function mayRequestOsPermission(input: {
  explicitPrimary: boolean;
  platform: OverlayPlatform;
}) {
  return input.explicitPrimary && input.platform !== "web";
}

export function shouldRefreshPermissionOnAppState(next: string) {
  return next === "active";
}

export function isStaleGeneration(generation: number, responseGeneration: number) {
  return generation !== responseGeneration;
}

export function dismissedStorageKey(userId?: string | null) {
  return userId ? `push-preprompt-dismissed:${userId}` : "push-preprompt-dismissed";
}

export const legacyDismissedStorageKey = "push-preprompt-dismissed";

export function isDismissedFromStoredValues(perUser: string | null, legacy: string | null) {
  return perUser === "1" || legacy === "1";
}
