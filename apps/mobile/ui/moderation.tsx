import { useState } from "react";

import type { WorkoutFeedItem } from "@repin/types";

import { markWorkoutDataStale } from "../lib/data-freshness";
import { clearWorkoutDetailCaches } from "../lib/workout-detail-cache";
import { BlockSheet, type BlockRequest } from "./block-sheet";
import { ReportSheet, type ReportTarget } from "./report-sheet";

type ActiveReport = ReportTarget & { hideId: string };

export function useModeration(handlers?: {
  onCommentHidden?: (commentId: string) => void;
  onPostHidden?: (workoutSessionId: string) => void;
  onUserBlocked?: (userId: string) => void;
}) {
  const [report, setReport] = useState<ActiveReport | null>(null);
  const [block, setBlock] = useState<BlockRequest | null>(null);
  const [reportAfterBlock, setReportAfterBlock] = useState<ActiveReport | null>(null);

  const refresh = () => {
    markWorkoutDataStale();
    clearWorkoutDetailCaches();
  };

  const ui = (
    <>
      <ReportSheet
        onBlocked={(userId) => handlers?.onUserBlocked?.(userId)}
        onDismiss={() => setReport(null)}
        onHidden={() => {
          if (!report) return;
          refresh();
          if (report.kind === "post") handlers?.onPostHidden?.(report.hideId);
          else handlers?.onCommentHidden?.(report.hideId);
        }}
        onOpenBlock={() => {
          if (!report) return;
          setReportAfterBlock(report);
          setReport(null);
          setBlock({ displayName: report.displayName, mode: "block", userId: report.userId });
        }}
        target={report}
      />
      <BlockSheet
        onBlocked={(userId) => {
          refresh();
          handlers?.onUserBlocked?.(userId);
        }}
        onDismiss={() => {
          setBlock(null);
          setReportAfterBlock(null);
        }}
        onReport={reportAfterBlock ? () => {
          const next = reportAfterBlock;
          setBlock(null);
          setReportAfterBlock(null);
          setReport(next);
        } : undefined}
        onUnblocked={() => undefined}
        request={block}
      />
    </>
  );

  return {
    askBlock(userId: string, displayName: string, source?: ActiveReport) {
      setReportAfterBlock(source ?? null);
      setReport(null);
      setBlock({ displayName, mode: "block", userId });
    },
    askReportComment(comment: { displayName: string; id: string; userId: string }) {
      setReport({
        displayName: comment.displayName,
        hideId: comment.id,
        kind: "comment",
        targetId: comment.id,
        userId: comment.userId,
      });
    },
    askReportPost(workout: WorkoutFeedItem) {
      setReport({
        displayName: workout.displayName,
        hideId: workout.id,
        kind: "post",
        targetId: workout.communityPostId ?? workout.id,
        userId: workout.userId,
      });
    },
    ui,
  };
}
