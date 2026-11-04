import type { ContentReportReason, ContentReportTargetType } from "@repin/types";
import { resolveUserDisplayName } from "@repin/types";

export type AdminQueueStatus = "open" | "removed" | "dismissed";

export type SerializedAdminReport = {
  id: string;
  reporterDisplayName: string;
  reason: ContentReportReason;
  details: string | null;
  createdAt: string;
};

export type SerializedAdminQueueItem = {
  id: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ContentReportReason;
  authorDisplayName: string;
  groupName: string;
  workoutName: string | null;
  reportCount: number;
  firstReportedAt: string;
  status: AdminQueueStatus;
  resolvedAt: string | null;
  resolvedByDisplayName: string | null;
  contentRemoved: boolean;
  contentMissing: boolean;
  contentText: string | null;
  photoUrl: string | null;
  contentCreatedAt: string | null;
  reports: SerializedAdminReport[];
  authorHistory: {
    displayName: string;
    removedCount: number;
    groupCount: number;
  };
};

export function serializeAdminQueueItem(
  item: {
    id: string;
    targetType: ContentReportTargetType;
    targetId: string;
    reason: ContentReportReason;
    authorDisplayName: string;
    groupName: string;
    workoutName: string | null;
    reportCount: number;
    firstReportedAt: Date;
    status: AdminQueueStatus;
    resolvedAt: Date | null;
    resolvedByDisplayName: string | null;
    contentRemoved: boolean;
    contentMissing: boolean;
    contentText: string | null;
    contentCreatedAt: Date | null;
    reports: Array<{
      id: string;
      reporterDisplayName: string;
      reason: ContentReportReason;
      details: string | null;
      createdAt: Date;
    }>;
    authorHistory: {
      displayName: string;
      removedCount: number;
      groupCount: number;
    };
  },
  photoUrl: string | null,
): SerializedAdminQueueItem {
  return {
    id: item.id,
    targetType: item.targetType,
    targetId: item.targetId,
    reason: item.reason,
    authorDisplayName: resolveUserDisplayName({ displayName: item.authorDisplayName }),
    groupName: item.groupName,
    workoutName: item.workoutName,
    reportCount: item.reportCount,
    firstReportedAt: item.firstReportedAt.toISOString(),
    status: item.status,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    resolvedByDisplayName: item.resolvedByDisplayName
      ? resolveUserDisplayName({ displayName: item.resolvedByDisplayName })
      : null,
    contentRemoved: item.contentRemoved,
    contentMissing: item.contentMissing,
    contentText: item.contentText,
    photoUrl,
    contentCreatedAt: item.contentCreatedAt?.toISOString() ?? null,
    reports: item.reports.map((report) => ({
      id: report.id,
      reporterDisplayName: resolveUserDisplayName({ displayName: report.reporterDisplayName }),
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt.toISOString(),
    })),
    authorHistory: {
      displayName: resolveUserDisplayName({ displayName: item.authorHistory.displayName }),
      removedCount: item.authorHistory.removedCount,
      groupCount: item.authorHistory.groupCount,
    },
  };
}
