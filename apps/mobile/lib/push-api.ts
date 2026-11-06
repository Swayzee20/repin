import type { PushPlatform } from "@repin/validation";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export async function registerDevicePushToken(input: {
  accessToken: string;
  expoPushToken: string;
  platform: PushPlatform;
}) {
  const response = await fetch(`${apiUrl}/api/push/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expoPushToken: input.expoPushToken,
      platform: input.platform,
    }),
    signal: AbortSignal.timeout(7_500),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Push token could not be saved.");
  }
}

export async function fetchHasCrewMembership(accessToken: string) {
  try {
    const response = await fetch(`${apiUrl}/api/groups`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(7_500),
    });
    const body = (await response.json().catch(() => null)) as { groups?: unknown } | null;
    if (!response.ok || !Array.isArray(body?.groups)) return null;
    return body.groups.length > 0;
  } catch {
    return null;
  }
}

export async function unregisterDevicePushToken(input: {
  accessToken: string;
  expoPushToken: string;
}) {
  const response = await fetch(`${apiUrl}/api/push/token`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expoPushToken: input.expoPushToken }),
    signal: AbortSignal.timeout(7_500),
  });
  if (!response.ok && response.status !== 401) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Push token could not be removed.");
  }
}
