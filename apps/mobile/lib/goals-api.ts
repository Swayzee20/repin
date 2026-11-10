import type { GoalDetail, GoalBadge, GoalsListResponse } from "@repin/types";

import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function authHeader() {
  if (!supabase) throw new Error("Sign in to manage goals.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to manage goals.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export async function listGoals(): Promise<GoalsListResponse> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals`, { headers, signal: AbortSignal.timeout(7_500) });
  return readJson<GoalsListResponse>(response);
}

export async function getGoal(goalId: string): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}`, {
    headers,
    signal: AbortSignal.timeout(7_500),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function createGoal(payload: Record<string, unknown>): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function updateGoal(goalId: string, payload: Record<string, unknown>): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function archiveGoal(goalId: string): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}/archive`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function deleteGoal(goalId: string) {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}`, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  await readJson<{ ok: boolean }>(response);
}

export async function markGoalDone(goalId: string): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}/complete`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function reopenGoal(goalId: string): Promise<GoalDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/goals/${encodeURIComponent(goalId)}/reopen`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJson<{ goal: GoalDetail }>(response);
  return body.goal;
}

export async function shareSessionGoals(groupId: string, sessionId: string, periodIds?: string[]): Promise<GoalBadge[]> {
  const headers = await authHeader();
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/goals/share`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ periodIds }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await readJson<{ goalBadges?: GoalBadge[] }>(response);
  return body.goalBadges ?? [];
}

export async function removeSessionGoalBadges(groupId: string, sessionId: string): Promise<GoalBadge[]> {
  const headers = await authHeader();
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/goals/badge`,
    {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await readJson<{ goalBadges?: GoalBadge[] }>(response);
  return body.goalBadges ?? [];
}

export async function restoreSessionGoalBadges(
  groupId: string,
  sessionId: string,
  periodIds: string[],
): Promise<GoalBadge[]> {
  const headers = await authHeader();
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/goals/badge`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ periodIds }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await readJson<{ goalBadges?: GoalBadge[] }>(response);
  return body.goalBadges ?? [];
}

export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
