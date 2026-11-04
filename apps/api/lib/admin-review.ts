import { reviewContentReportSchema } from "@repin/validation";

import { isAdminUserId } from "./admin-ids";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
export const REPORT_DUE_WINDOW_MS = 24 * HOUR_MS;
export const REPORT_DUE_SOON_MS = 2 * HOUR_MS;

export type ReviewContentReportAction = "remove" | "keep" | "restore";

export type ReviewContentReportFn = (input: {
  actorId: string;
  reportId: string;
  action: ReviewContentReportAction;
}) => Promise<
  | { ok: true; action: ReviewContentReportAction }
  | { ok: false; reason: "not_found" | "invalid" }
>;

export function dueState(firstReportedAt: Date, now = new Date()) {
  const remaining = firstReportedAt.getTime() + REPORT_DUE_WINDOW_MS - now.getTime();
  if (remaining < 0) {
    return { label: "Overdue", tone: "danger" as const };
  }
  return {
    label: `Due in ${Math.floor(remaining / HOUR_MS)} h`,
    tone: remaining < REPORT_DUE_SOON_MS ? ("danger" as const) : ("muted" as const),
  };
}

export function formatAge(from: Date, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function formatClock(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function formatContentTime(value: Date, now = new Date()) {
  const time = formatClock(value);
  const sameDay =
    value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
  if (sameDay) return `Today, ${time}`;
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value)}, ${time}`;
}

export function formatResolvedTime(value: Date) {
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value)}, ${formatClock(value)}`;
}

export async function handleAdminReportAction(
  input: {
    userId: string | null | undefined;
    reportId: string;
    body: unknown;
    adminUserIds?: string;
  },
  review: ReviewContentReportFn,
) {
  const userId = input.userId;
  if (!userId || !isAdminUserId(userId, input.adminUserIds)) {
    return { status: 404 as const, body: { error: "Not found" } };
  }

  const parsed = reviewContentReportSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400 as const, body: { error: "Action is invalid" } };
  }

  const result = await review({
    actorId: userId,
    reportId: input.reportId,
    action: parsed.data.action,
  });
  if (!result.ok) {
    return {
      status: result.reason === "invalid" ? 400 as const : 404 as const,
      body: { error: "Not found" },
    };
  }

  return { status: 200 as const, body: { ok: true as const, action: result.action } };
}

