import type { DetectedPr, PrBadge, PrDetectionResult, PrPrompt } from "@repin/types";

import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function answerPrPrompts(
  groupId: string,
  sessionId: string,
  answers: Array<{ confirmed: boolean; key: string; kind: PrPrompt["kind"] }>,
): Promise<PrDetectionResult> {
  const body = await prRequest(
    groupId,
    sessionId,
    "prs/baseline",
    "POST",
    { answers },
  ) as { pr?: PrDetectionResult; error?: string };
  if (!body.pr) throw new Error(body.error ?? "PR answers could not be saved.");
  return body.pr;
}

export async function shareSessionPrs(groupId: string, sessionId: string): Promise<PrBadge[]> {
  const body = await prRequest(groupId, sessionId, "prs/share", "POST", {}) as {
    error?: string;
    prBadges?: PrBadge[];
  };
  if (!body.prBadges?.length) {
    throw new Error(body.error ?? "PR badge could not be shared.");
  }
  return body.prBadges;
}

export async function removeSessionPrBadges(groupId: string, sessionId: string): Promise<PrBadge[]> {
  const body = await prRequest(groupId, sessionId, "prs/badge", "DELETE") as {
    error?: string;
    prBadges?: PrBadge[];
  };
  if (!body.prBadges) throw new Error(body.error ?? "PR badge could not be removed.");
  return body.prBadges;
}

export async function restoreSessionPrBadges(
  groupId: string,
  sessionId: string,
  badges: Array<Pick<PrBadge, "key" | "kind">>,
): Promise<PrBadge[]> {
  const body = await prRequest(groupId, sessionId, "prs/badge", "POST", {
    badges: badges.map((badge) => ({ key: badge.key, kind: badge.kind })),
  }) as { error?: string; prBadges?: PrBadge[] };
  if (!body.prBadges) throw new Error(body.error ?? "PR badge could not be restored.");
  return body.prBadges;
}

export function mergeCelebrated(
  autoDetected: DetectedPr[],
  confirmed: DetectedPr[],
) {
  const seen = new Set(autoDetected.map((item) => `${item.kind}:${item.key}`));
  return [
    ...autoDetected,
    ...confirmed.filter((item) => !seen.has(`${item.kind}:${item.key}`)),
  ];
}

async function prRequest(
  groupId: string,
  sessionId: string,
  path: string,
  method: string,
  json?: unknown,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to continue.");
  const response = await fetch(
    `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      signal: AbortSignal.timeout(10_000),
    },
  );
  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(typeof body.error === "string" && body.error
      ? body.error
      : "Request failed.");
  }
  return body;
}
