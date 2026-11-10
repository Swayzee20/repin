import type { GoalDetail } from "@repin/types";
import { goalCopy } from "@repin/validation";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  archiveGoal,
  deleteGoal,
  getGoal,
  markGoalDone,
  reopenGoal,
  shareSessionGoals,
} from "../../../lib/goals-api";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { Button, Card, LoadingState, StateCard } from "../../../ui/components";
import { ConfirmSheet } from "../../../ui/crew-sheets";
import { GoalProgressCard, GoalStatusChip } from "../../../ui/goals";
import { TwoPane, useLayoutMode } from "../../../ui/layout";
import { RoundIconButton, roundNavButtonStyle } from "../../../ui/primitives";
import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../../ui/pushed-header";
import { colors, spacing, type } from "../../../ui/theme";
import { useStripState } from "../../../ui/vertical-bar-edge";

export default function GoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { mode } = useLayoutMode();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const twoPane = mode === "twoPane";
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | "reopen" | "done" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!goalId) {
      setError("Goal could not be loaded.");
      setLoading(false);
      return;
    }
    if (__DEV__ && isLayoutPreview()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setGoal(await getGoal(goalId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Goal could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (work: () => Promise<unknown>, leave = false) => {
    setPending(true);
    setActionError(null);
    try {
      await work();
      setConfirm(null);
      if (leave) router.back();
      else await load();
    } catch (runError) {
      setActionError(runError instanceof Error ? runError.message : "That could not be completed.");
    } finally {
      setPending(false);
    }
  };

  const body = !goal ? null : (
    <View style={styles.stack}>
      <GoalProgressCard goal={goal} />
      <Card style={styles.metaCard}>
        <GoalStatusChip goal={goal} />
        {goal.helper ? <Text style={styles.helper}>{goal.helper}</Text> : null}
        <Text style={styles.helper}>{goalCopy.loggedAfterHelper}</Text>
        {goal.progress.lastQualifyingLabel ? (
          <Text style={styles.helper}>Last qualifying log: {goal.progress.lastQualifyingLabel}</Text>
        ) : null}
      </Card>
      {goal.shareable && goal.sourceGroupId && goal.sourceSessionId ? (
        <Button
          loading={pending}
          onPress={() => void run(() => shareSessionGoals(
            goal.sourceGroupId as string,
            goal.sourceSessionId as string,
            goal.currentPeriodId ? [goal.currentPeriodId] : undefined,
          ))}
        >
          {`Share with ${goal.shareCrewName ?? "your crew"}`}
        </Button>
      ) : null}
      {goal.state === "active" ? (
        <Button onPress={() => router.push(`/goals/${goal.id}/edit`)} variant="secondary">
          Edit goal
        </Button>
      ) : null}
      {goal.canMarkDone ? (
        <Button onPress={() => setConfirm("done")} variant="tonal">Mark as done</Button>
      ) : null}
      {goal.canReopen ? (
        <Button
          disabled={goal.reopenBlocked}
          disabledReason={goal.reopenBlocked ? goalCopy.reopenAtCap : undefined}
          onPress={() => setConfirm("reopen")}
        >
          Reopen goal
        </Button>
      ) : null}
      {goal.state === "active" ? (
        <Button onPress={() => setConfirm("archive")} variant="secondary">Archive</Button>
      ) : null}
      <Button onPress={() => setConfirm("delete")} variant="danger">Delete</Button>
      {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
    </View>
  );

  return (
    <>
      {nativeHeader ? <Stack.Screen options={pushedHeaderScreenOptions()} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            column="readable"
            contentPaddingBottom={spacing.xxl}
            fallback="stack"
            left={(
              <View style={styles.pane}>
                {roundBack ? <RoundIconButton kind="back" onPress={() => router.back()} style={roundNavButtonStyle} /> : null}
                <Text style={styles.title}>Goal</Text>
                {loading && !goal ? <LoadingState message="Loading goal…" /> : null}
                {error && !goal ? (
                  <StateCard actionLabel="Try again" message={error} onAction={() => void load()} title="Goal unavailable" />
                ) : null}
                {twoPane ? null : body}
              </View>
            )}
            right={twoPane ? <View style={styles.pane}>{body}</View> : <View />}
          />
        </View>
      </SafeAreaView>
      <ConfirmSheet
        body={goalCopy.archiveBody}
        confirmLabel="Archive"
        confirmVariant="primary"
        onConfirm={() => void run(() => archiveGoal(goalId ?? ""), true)}
        onDismiss={() => setConfirm(null)}
        pending={pending}
        title={goalCopy.archiveTitle}
        visible={confirm === "archive"}
      />
      <ConfirmSheet
        body={goalCopy.deleteBody}
        confirmLabel="Delete"
        onConfirm={() => void run(() => deleteGoal(goalId ?? ""), true)}
        onDismiss={() => setConfirm(null)}
        pending={pending}
        title={goalCopy.deleteTitle}
        visible={confirm === "delete"}
      />
      <ConfirmSheet
        body={goalCopy.reopenBody}
        confirmLabel="Reopen"
        confirmVariant="primary"
        onConfirm={() => void run(() => reopenGoal(goalId ?? ""))}
        onDismiss={() => setConfirm(null)}
        pending={pending}
        title={goalCopy.reopenTitle}
        visible={confirm === "reopen"}
      />
      <ConfirmSheet
        body={goalCopy.markDoneBody}
        confirmLabel="Mark as done"
        confirmVariant="primary"
        onConfirm={() => void run(() => markGoalDone(goalId ?? ""))}
        onDismiss={() => setConfirm(null)}
        pending={pending}
        title={goalCopy.markDoneTitle}
        visible={confirm === "done"}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1, gap: spacing.lg },
  title: { color: colors.ink, ...type.screenTitle },
  stack: { gap: spacing.md },
  metaCard: { gap: spacing.md },
  helper: { color: colors.muted, ...type.bodySmall },
  error: { color: colors.danger, ...type.bodySmall },
});
