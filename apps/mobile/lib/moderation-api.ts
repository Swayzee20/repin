import type { BlockedUserSummary, ContentReportReason } from "@repin/types";

import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function authorized(method: string, path: string, body?: unknown) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to continue.");
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("offline");
  }
  const payload = (await response.json().catch(() => null)) as {
    blocked?: boolean;
    blockedUsers?: BlockedUserSummary[];
    error?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.error ?? "offline");
  return payload;
}

export async function sendReport(input: {
  alsoBlock?: boolean;
  details?: string;
  reason: ContentReportReason;
  targetId: string;
  targetType: "comment" | "post";
}) {
  const payload = await authorized("POST", "/api/reports", {
    alsoBlock: input.alsoBlock || undefined,
    details: input.details?.trim() || undefined,
    reason: input.reason,
    targetId: input.targetId,
    targetType: input.targetType,
  });
  return { blocked: payload?.blocked === true };
}

export async function listBlockedUsers() {
  const payload = await authorized("GET", "/api/blocks");
  return Array.isArray(payload?.blockedUsers) ? payload.blockedUsers : [];
}

export function blockAccount(userId: string) {
  return authorized("POST", `/api/blocks/${encodeURIComponent(userId)}`);
}

export function unblockAccount(userId: string) {
  return authorized("DELETE", `/api/blocks/${encodeURIComponent(userId)}`);
}
