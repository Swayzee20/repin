import {
  contentReportReasonLabels,
  type ContentReportSummary,
} from "@repin/types";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  dismissGroupReport,
  listGroupReports,
  removeGroupPost,
  deleteGroupComment,
} from "../../../lib/moderation-api";
import { markWorkoutDataStale } from "../../../lib/data-freshness";
import { Button, Card, LoadingState, StateCard } from "../../../ui/components";
import { Dialog } from "../../../ui/dialog";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../../ui/primitives";
import { colors, layout, spacing, type } from "../../../ui/theme";

export default function GroupReportsScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const twoPane = mode === "twoPane";
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [reports, setReports] = useState<ContentReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ContentReportSummary | null>(null);

  const load = useCallback(async () => {
    if (!groupId) {
      setError("This group link is invalid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReports(await listGroupReports(groupId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Reports could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const dismiss = async (report: ContentReportSummary) => {
    if (!groupId) return;
    setPendingId(report.id);
    setError(null);
    try {
      await dismissGroupReport(groupId, report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : "Report could not be dismissed.");
    } finally {
      setPendingId(null);
    }
  };

  const remove = async () => {
    if (!groupId || !removeTarget?.workoutSessionId) return;
    setPendingId(removeTarget.id);
    setError(null);
    try {
      if (removeTarget.targetType === "post") {
        await removeGroupPost(groupId, removeTarget.workoutSessionId);
      } else {
        await deleteGroupComment(groupId, removeTarget.targetId);
      }
      markWorkoutDataStale();
      setReports((current) => current.filter((item) => {
        if (item.id === removeTarget.id) return false;
        return !(removeTarget.targetType === "post" && item.workoutSessionId === removeTarget.workoutSessionId);
      }));
      setRemoveTarget(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Content could not be removed.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <TwoPane
        column="form"
        contentPaddingBottom={spacing.xxl}
        fallback="stack"
        left={(
          <View style={styles.pane}>
            <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
            <Text style={styles.title}>Reports</Text>
            <Text style={styles.intro}>Open reports for this group. Remove the content or dismiss the report.</Text>
          </View>
        )}
        right={(
          <View style={twoPane ? styles.listPane : styles.listStack}>
            {loading ? <LoadingState message="Loading reports…" /> : null}
            {!loading && error && reports.length === 0 ? (
              <StateCard actionLabel="Try again" message={error} onAction={() => void load()} title="Couldn't load reports" />
            ) : null}
            {!loading && !error && reports.length === 0 ? (
              <StateCard message="Nothing is waiting for review." title="No open reports" />
            ) : null}
            {error && reports.length ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {!loading ? reports.map((report) => (
              <Card key={report.id} style={styles.reportCard}>
                <Text style={styles.reason}>{contentReportReasonLabels[report.reason]}</Text>
                <Text style={styles.excerpt}>{report.excerpt}</Text>
                <Text style={styles.meta}>
                  {report.targetType === "comment" ? "Comment" : "Post"} by {report.authorDisplayName}
                </Text>
                <Text style={styles.meta}>Reported by {report.reporterDisplayName} · {formatReportTime(report.createdAt)}</Text>
                {report.note ? <Text style={styles.note}>{report.note}</Text> : null}
                <Button
                  disabled={!report.workoutSessionId || pendingId === report.id}
                  disabledReason={report.workoutSessionId ? undefined : "This content is already gone."}
                  loading={pendingId === report.id && removeTarget?.id === report.id}
                  loadingLabel="Removing"
                  onPress={() => setRemoveTarget(report)}
                  variant="danger"
                >
                  Remove
                </Button>
                <Button
                  disabled={pendingId === report.id}
                  loading={pendingId === report.id && removeTarget?.id !== report.id}
                  loadingLabel="Dismissing"
                  onPress={() => void dismiss(report)}
                  variant="secondary"
                >
                  Dismiss
                </Button>
              </Card>
            )) : null}
          </View>
        )}
      />
      <Dialog
        closeLabel="Cancel remove"
        dismissDisabled={pendingId !== null}
        onDismiss={() => setRemoveTarget(null)}
        visible={removeTarget !== null}
      >
        <Text style={styles.dialogTitle}>
          {removeTarget?.targetType === "comment" ? "Remove this comment?" : "Remove this post?"}
        </Text>
        <Text style={styles.dialogBody}>It will be deleted for everyone in the group.</Text>
        <Button loading={pendingId !== null} loadingLabel="Removing" onPress={() => void remove()} variant="danger">Remove</Button>
        <Button disabled={pendingId !== null} onPress={() => setRemoveTarget(null)} variant="secondary">Cancel</Button>
      </Dialog>
    </SafeAreaView>
  );
}

function formatReportTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  pane: { flexGrow: 1, maxWidth: layout.formMax, width: "100%" },
  title: { color: colors.ink, ...type.screenTitle, marginTop: spacing.lg },
  intro: { color: colors.muted, ...type.body, marginTop: spacing.sm },
  listPane: { gap: spacing.md, maxWidth: layout.formMax, width: "100%" },
  listStack: { gap: spacing.md, marginTop: spacing.xxl, maxWidth: layout.formMax, width: "100%" },
  reportCard: { gap: spacing.md },
  reason: { color: colors.ink, ...type.section },
  excerpt: { color: colors.inkSoft, ...type.body },
  meta: { color: colors.muted, ...type.bodySmall },
  note: { color: colors.inkSoft, ...type.bodySmall },
  error: { color: colors.danger, ...type.bodySmall },
  dialogTitle: { color: colors.ink, ...type.heading },
  dialogBody: { color: colors.inkSoft, ...type.body },
});
