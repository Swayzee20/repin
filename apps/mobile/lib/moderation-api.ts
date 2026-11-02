import type {
  BlockedUserSummary,
  ContentReportReason,
  ContentReportSummary,
} from "@repin/types";

import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Json = Record<string, unknown> | null;

async function authorized(method: string, path: string, body?: unknown): Promise<Json> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to continue.");
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "That could not be completed.");
  return payload;
}

export function reportContent(input: {
  commentId?: string;
  groupId: string;
  note?: string;
  reason: ContentReportReason;
  targetType: "post" | "comment";
  workoutSessionId?: string;
}) {
  return authorized("POST", `/api/groups/${encodeURIComponent(input.groupId)}/reports`, {
    targetType: input.targetType,
    reason: input.reason,
    note: input.note?.trim() || undefined,
    ...(input.targetType === "post"
      ? { workoutSessionId: input.workoutSessionId }
      : { commentId: input.commentId }),
  });
}

export function blockUser(blockedUserId: string) {
  return authorized("POST", "/api/me/blocks", { blockedUserId });
}

export function unblockUser(blockedUserId: string) {
  return authorized("DELETE", `/api/me/blocks/${encodeURIComponent(blockedUserId)}`);
}

export async function listBlockedUsers() {
  const payload = await authorized("GET", "/api/me/blocks");
  const blockedUsers = payload && Array.isArray(payload.blockedUsers)
    ? payload.blockedUsers as BlockedUserSummary[]
    : [];
  return blockedUsers;
}

export async function listGroupReports(groupId: string) {
  const payload = await authorized("GET", `/api/groups/${encodeURIComponent(groupId)}/reports`);
  const reports = payload && Array.isArray(payload.reports)
    ? payload.reports as ContentReportSummary[]
    : [];
  return reports;
}

export function dismissGroupReport(groupId: string, reportId: string) {
  return authorized(
    "POST",
    `/api/groups/${encodeURIComponent(groupId)}/reports/${encodeURIComponent(reportId)}/dismiss`,
  );
}

export function removeGroupPost(groupId: string, workoutSessionId: string) {
  return authorized(
    "DELETE",
    `/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(workoutSessionId)}/moderate`,
  );
}

export function deleteGroupComment(groupId: string, commentId: string) {
  return authorized(
    "DELETE",
    `/api/groups/${encodeURIComponent(groupId)}/comments/${encodeURIComponent(commentId)}`,
  );
}
