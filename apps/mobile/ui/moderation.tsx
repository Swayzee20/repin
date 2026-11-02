import {
  contentReportReasonLabels,
  contentReportReasons,
  reportConfirmationMessage,
  resolveUserDisplayName,
  type ContentReportReason,
} from "@repin/types";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { markWorkoutDataStale } from "../lib/data-freshness";
import {
  blockUser,
  deleteGroupComment,
  removeGroupPost,
  reportContent,
} from "../lib/moderation-api";
import { clearWorkoutDetailCaches } from "../lib/workout-detail-cache";
import { Button, TextField } from "./components";
import { Dialog } from "./dialog";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, spacing, type } from "./theme";

type ReportRequest =
  | { kind: "post"; groupId: string; workoutSessionId: string }
  | { kind: "comment"; commentId: string; groupId: string; workoutSessionId: string };

type RemoveRequest =
  | { kind: "post"; groupId: string; workoutSessionId: string }
  | { kind: "comment"; commentId: string; groupId: string; workoutSessionId: string };

type BlockRequest = { displayName: string; userId: string };

export function useModeration(handlers?: {
  onCommentHidden?: (commentId: string) => void;
  onPostHidden?: (workoutSessionId: string) => void;
  onUserBlocked?: (userId: string) => void;
}) {
  const [reportTarget, setReportTarget] = useState<ReportRequest | null>(null);
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [note, setNote] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportPending, setReportPending] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [blockTarget, setBlockTarget] = useState<BlockRequest | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockPending, setBlockPending] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<RemoveRequest | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState(false);

  const resetReport = () => {
    setReportTarget(null);
    setReason(null);
    setNote("");
    setReportError(null);
    setReportPending(false);
    setReportDone(false);
  };

  const finishReport = (target: ReportRequest) => {
    markWorkoutDataStale();
    clearWorkoutDetailCaches();
    if (target.kind === "post") handlers?.onPostHidden?.(target.workoutSessionId);
    else handlers?.onCommentHidden?.(target.commentId);
    setReportDone(true);
  };

  const submitReport = async () => {
    if (!reportTarget || !reason || reportPending) return;
    setReportPending(true);
    setReportError(null);
    try {
      await reportContent({
        groupId: reportTarget.groupId,
        reason,
        note,
        targetType: reportTarget.kind,
        workoutSessionId: reportTarget.kind === "post" ? reportTarget.workoutSessionId : undefined,
        commentId: reportTarget.kind === "comment" ? reportTarget.commentId : undefined,
      });
      finishReport(reportTarget);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Report could not be sent.");
      setReportPending(false);
    }
  };

  const submitBlock = async () => {
    if (!blockTarget || blockPending) return;
    setBlockPending(true);
    setBlockError(null);
    try {
      await blockUser(blockTarget.userId);
      markWorkoutDataStale();
      clearWorkoutDetailCaches();
      handlers?.onUserBlocked?.(blockTarget.userId);
      setBlockTarget(null);
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : "Person could not be blocked.");
    } finally {
      setBlockPending(false);
    }
  };

  const submitRemove = async () => {
    if (!removeTarget || removePending) return;
    setRemovePending(true);
    setRemoveError(null);
    try {
      if (removeTarget.kind === "post") {
        await removeGroupPost(removeTarget.groupId, removeTarget.workoutSessionId);
        handlers?.onPostHidden?.(removeTarget.workoutSessionId);
      } else {
        await deleteGroupComment(removeTarget.groupId, removeTarget.commentId);
        handlers?.onCommentHidden?.(removeTarget.commentId);
      }
      markWorkoutDataStale();
      clearWorkoutDetailCaches();
      setRemoveTarget(null);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Content could not be removed.");
    } finally {
      setRemovePending(false);
    }
  };

  const blockName = blockTarget ? resolveUserDisplayName({ displayName: blockTarget.displayName }) : "this person";

  const ui = (
    <>
      <BottomSheet
        closeLabel="Close report"
        onDismiss={resetReport}
        title={reportDone ? "Report sent" : "Report"}
        visible={reportTarget !== null}
      >
        {reportDone ? (
          <View style={styles.stack}>
            <Text style={styles.body}>{reportConfirmationMessage}</Text>
            <Button onPress={resetReport}>Done</Button>
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.body}>Why are you reporting this?</Text>
            {contentReportReasons.map((option) => (
              <SheetRow
                accessibilityLabel={contentReportReasonLabels[option]}
                divider
                key={option}
                onPress={() => setReason(option)}
                selected={reason === option}
              >
                <Text style={styles.reason}>{contentReportReasonLabels[option]}</Text>
              </SheetRow>
            ))}
            <TextField
              label="Note"
              maxLength={500}
              multiline
              onChangeText={setNote}
              optional
              placeholder="Add a note"
              value={note}
            />
            {reportError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{reportError}</Text> : null}
            <Button
              disabled={!reason}
              disabledReason="Choose a reason."
              loading={reportPending}
              loadingLabel="Sending"
              onPress={() => void submitReport()}
            >
              Submit report
            </Button>
          </View>
        )}
      </BottomSheet>
      <Dialog closeLabel="Cancel block" dismissDisabled={blockPending} onDismiss={() => setBlockTarget(null)} visible={blockTarget !== null}>
        <Text style={styles.dialogTitle}>Block {blockName}?</Text>
        <Text style={styles.body}>Their posts, comments, and reactions will be hidden from you. They stay in your groups.</Text>
        {blockError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{blockError}</Text> : null}
        <Button loading={blockPending} loadingLabel="Blocking" onPress={() => void submitBlock()} variant="danger">Block</Button>
        <Button disabled={blockPending} onPress={() => setBlockTarget(null)} variant="secondary">Cancel</Button>
      </Dialog>
      <Dialog closeLabel="Cancel remove" dismissDisabled={removePending} onDismiss={() => setRemoveTarget(null)} visible={removeTarget !== null}>
        <Text style={styles.dialogTitle}>{removeTarget?.kind === "comment" ? "Remove this comment?" : "Remove this post?"}</Text>
        <Text style={styles.body}>It will be deleted for everyone in the group.</Text>
        {removeError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{removeError}</Text> : null}
        <Button loading={removePending} loadingLabel="Removing" onPress={() => void submitRemove()} variant="danger">Remove</Button>
        <Button disabled={removePending} onPress={() => setRemoveTarget(null)} variant="secondary">Cancel</Button>
      </Dialog>
    </>
  );

  return {
    askBlock(userId: string, displayName: string) {
      setBlockError(null);
      setBlockTarget({ displayName, userId });
    },
    askRemoveComment(groupId: string, workoutSessionId: string, commentId: string) {
      setRemoveError(null);
      setRemoveTarget({ commentId, groupId, kind: "comment", workoutSessionId });
    },
    askRemovePost(groupId: string, workoutSessionId: string) {
      setRemoveError(null);
      setRemoveTarget({ groupId, kind: "post", workoutSessionId });
    },
    askReportComment(groupId: string, workoutSessionId: string, commentId: string) {
      resetReport();
      setReportTarget({ commentId, groupId, kind: "comment", workoutSessionId });
    },
    askReportPost(groupId: string, workoutSessionId: string) {
      resetReport();
      setReportTarget({ groupId, kind: "post", workoutSessionId });
    },
    ui,
  };
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  body: { color: colors.inkSoft, ...type.body },
  reason: { color: colors.ink, ...type.body },
  dialogTitle: { color: colors.ink, ...type.heading },
  error: { color: colors.danger, ...type.bodySmall },
});
