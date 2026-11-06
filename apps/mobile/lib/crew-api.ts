import type { CrewPage } from "@repin/types";
import type { CrewNotificationPrefs } from "@repin/validation";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };
  return { body, ok: response.ok, status: response.status };
}

export async function fetchCrewPage(input: {
  accessToken: string;
  groupId: string;
}) {
  const search = new URLSearchParams({
    timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
  });
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}?${search.toString()}`,
    {
      headers: authHeaders(input.accessToken),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<CrewPage>(response);
  if (!ok || !body.group || !body.members || !body.notifications) {
    throw new Error(body.error ?? "Crew could not be loaded.");
  }
  return body;
}

export async function updateCrew(input: {
  accessToken: string;
  groupId: string;
  name?: string;
  photoPath?: string | null;
}) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(input.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        photoPath: input.photoPath,
      }),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<{ error?: string }>(response);
  if (!ok) throw new Error(body.error ?? "Crew could not be updated.");
}

export async function resetCrewInvite(input: { accessToken: string; groupId: string }) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/invite-reset`,
    {
      method: "POST",
      headers: authHeaders(input.accessToken),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<{ inviteCode?: string; error?: string }>(response);
  if (!ok || !body.inviteCode) throw new Error(body.error ?? "Invite code could not be reset.");
  return body.inviteCode;
}

export async function transferCrew(input: {
  accessToken: string;
  groupId: string;
  userId: string;
}) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/transfer`,
    {
      method: "POST",
      headers: { ...authHeaders(input.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ userId: input.userId }),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<{ error?: string }>(response);
  if (!ok) throw new Error(body.error ?? "Ownership could not be transferred.");
}

export async function removeCrewMemberRequest(input: {
  accessToken: string;
  groupId: string;
  userId: string;
}) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(input.userId)}`,
    {
      method: "DELETE",
      headers: authHeaders(input.accessToken),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<{ displayName?: string; error?: string }>(response);
  if (!ok) throw new Error(body.error ?? "Member could not be removed.");
  return body.displayName ?? "Member";
}

export async function leaveCrewRequest(input: { accessToken: string; groupId: string }) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/leave`,
    {
      method: "POST",
      headers: authHeaders(input.accessToken),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok, status } = await readJson<{ closed?: boolean; error?: string }>(response);
  if (!ok) {
    const error = new Error(body.error ?? "Could not leave the crew.") as Error & { status?: number };
    error.status = status;
    throw error;
  }
  return body;
}

export async function saveCrewNotifications(input: {
  accessToken: string;
  groupId: string;
  prefs: CrewNotificationPrefs;
}) {
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/notifications`,
    {
      method: "PUT",
      headers: { ...authHeaders(input.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(input.prefs),
      signal: AbortSignal.timeout(7_500),
    },
  );
  const { body, ok } = await readJson<{ notifications?: CrewNotificationPrefs & { summary: string }; error?: string }>(response);
  if (!ok || !body.notifications) {
    throw new Error(body.error ?? "Notification prefs could not be saved.");
  }
  return body.notifications;
}
