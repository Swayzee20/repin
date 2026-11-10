import type { DetectedPr, GoalDetectionResult, GoalReached, PrDetectionResult } from "@repin/types";
import { goalCopy } from "@repin/validation";
import { useEffect, useReducer, useRef } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";

import { shareSessionGoals } from "../lib/goals-api";
import { answerPrPrompts, mergeCelebrated, shareSessionPrs } from "../lib/pr-api";
import { Button } from "./components";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { prCelebrationAnnouncement, prCopy } from "./pr-copy";
import { initialPrFlowState, reducePrFlow } from "./pr-flow-state";
import { RoundIconButton } from "./primitives";
import { BottomSheet } from "./sheet";
import { colors, radii, size, spacing, type } from "./theme";

export function PrLogOverlay({
  detection,
  goals,
  groupId,
  onFinished,
  sessionId,
}: {
  detection: PrDetectionResult | null;
  goals?: GoalDetectionResult | null;
  groupId: string;
  onFinished: () => void;
  sessionId: string;
}) {
  const [state, dispatch] = useReducer(reducePrFlow, detection, (value) => initialPrFlowState(value, goals));
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    dispatch({ detection, goals, type: "reset" });
  }, [detection, goals]);

  useEffect(() => {
    if (!state.finished || finishedRef.current) return;
    finishedRef.current = true;
    if (state.notice === "no_post") {
      AccessibilityInfo.announceForAccessibility(prCopy.noPostHelper);
    }
    onFinished();
  }, [onFinished, state.finished, state.notice]);

  const hasGoals = Boolean(state.goals.length);
  const hasPrs = Boolean(detection?.prompts.length || detection?.detected.length || state.celebrated.length);
  if (!hasGoals && !hasPrs) return null;

  const prompt = detection?.prompts[state.promptIndex];
  const dismiss = () => dispatch({ type: "dismissRequested" });
  const presenterHidden = () => {
    if (finishedRef.current) return;
    dispatch({ type: "presenterHidden" });
  };

  const answerPrompt = async (confirmed: boolean) => {
    if (!prompt || state.busy || state.finished) return;
    dispatch({ type: "promptStarted" });
    try {
      const next = await answerPrPrompts(groupId, sessionId, [{
        confirmed,
        key: prompt.key,
        kind: prompt.kind,
      }]);
      dispatch({
        hasMorePrompts: state.promptIndex + 1 < (detection?.prompts.length ?? 0),
        merged: mergeCelebrated(state.celebrated, next.detected),
        type: "promptAnswered",
      });
    } catch (submitError) {
      dispatch({
        message: submitError instanceof Error ? submitError.message : "Could not save that answer.",
        type: "promptFailed",
      });
    }
  };

  const share = async () => {
    if (state.presenter !== "share" || state.busy || state.finished) return;
    dispatch({ type: "shareStarted" });
    try {
      if (state.goals.length) {
        await shareSessionGoals(groupId, sessionId, state.goals.map((goal) => goal.periodId));
      }
      if (state.celebrated.length) {
        await shareSessionPrs(groupId, sessionId);
      }
      dispatch({ type: "shareSucceeded" });
    } catch (submitError) {
      dispatch({
        message: submitError instanceof Error ? submitError.message : (state.goals.length ? goalCopy.shareError : prCopy.shareFailed),
        type: "shareFailed",
      });
    }
  };

  const summary = [
    ...state.goals.map((item) => item.title),
    ...state.celebrated.map((item) => `${item.label} ${item.value}`),
  ].join(", ");
  const single = !hasGoals && state.celebrated.length === 1 ? state.celebrated[0] : null;
  const singleGoal = hasGoals && !state.celebrated.length && state.goals.length === 1 ? state.goals[0] : null;
  const hasCommunityPost = Boolean(detection?.communityPostId ?? goals?.communityPostId);
  const crewName = detection?.crewName ?? goals?.crewName;
  const celebrationTitle = hasGoals
    ? goalCopy.celebration
    : prCopy.celebrationTitle(state.celebrated.length);
  const celebrationHelper = hasCommunityPost
    ? (hasGoals ? "Just for you until you share. Sharing adds a Goal badge to the post you just logged." : prCopy.celebrationHelper)
    : (hasGoals ? goalCopy.noPost : prCopy.noPostHelper);
  const shareBody = hasGoals ? goalCopy.shareBody : prCopy.shareBody;

  return (
    <>
      <BottomSheet
        closeLabel="Close"
        onDismiss={() => {
          if (state.skipPromptDismiss) return;
          void answerPrompt(false);
        }}
        onHidden={presenterHidden}
        title={prCopy.promptTitle}
        visible={state.presenter === "prompt" && Boolean(prompt)}
      >
        {prompt ? (
          <View style={styles.stack}>
            <Text style={styles.body}>
              {prompt.intro === "for_time"
                ? prCopy.promptForTimeIntro(prompt.title)
                : prCopy.promptOneRepIntro}
            </Text>
            <View style={styles.promptResult}>
              <Text style={styles.promptTitle}>{prompt.title}</Text>
              <Text style={styles.promptValue}>{prompt.resultLine}</Text>
            </View>
            {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
            <Button loading={state.busy} onPress={() => void answerPrompt(true)}>
              {prCopy.promptPrimary}
            </Button>
            <Button disabled={state.busy} onPress={() => void answerPrompt(false)} variant="secondary">
              {prCopy.promptSecondary}
            </Button>
          </View>
        ) : null}
      </BottomSheet>

      <Dialog
        closeLabel="Close"
        onDismiss={dismiss}
        onHidden={presenterHidden}
        padding={spacing.xl}
        visible={state.presenter === "celebration"}
      >
        <View
          accessibilityLabel={hasGoals ? `${goalCopy.celebration}${state.celebrated.length ? ` ${goalCopy.combined}` : ""}` : prCelebrationAnnouncement(summary)}
          accessible
          style={styles.celebration}
        >
          <View style={styles.dialogCloseRow}>
            <RoundIconButton accessibilityLabel="Close" kind="close" onPress={dismiss} />
          </View>
          <View style={styles.check}>
            <Icon color={colors.success} name="checkmark" size={size.icon.md} />
          </View>
          <Text style={styles.celebrationTitle}>{celebrationTitle}</Text>
          {hasGoals && state.celebrated.length ? (
            <Text style={styles.combined}>{goalCopy.combined}</Text>
          ) : null}
          {single?.autoDetected ? (
            <View style={styles.autoChip}>
              <Text style={styles.autoChipText}>{prCopy.autoChip}</Text>
            </View>
          ) : null}
          {singleGoal ? (
            <SingleGoalBody goal={singleGoal} />
          ) : single ? (
            <SinglePrBody pr={single} />
          ) : (
            <View style={styles.multiList}>
              {state.goals.map((item) => (
                <View key={item.periodId} style={styles.multiRow}>
                  <View style={styles.miniGoalChip}><Text style={styles.miniChipText}>Goal</Text></View>
                  <View style={styles.multiCopy}>
                    <Text style={styles.promptTitle}>{item.title}</Text>
                    <Text style={styles.promptValue}>{item.resultLine} · {item.targetLine}</Text>
                  </View>
                </View>
              ))}
              {state.celebrated.map((item) => (
                <View key={`${item.kind}:${item.key}`} style={styles.multiRow}>
                  <View style={styles.miniChip}><Text style={styles.miniChipText}>PR</Text></View>
                  <View style={styles.multiCopy}>
                    <Text style={styles.promptTitle}>{item.label}</Text>
                    <Text style={styles.promptValue}>{item.value}</Text>
                  </View>
                  {item.delta ? <Text style={styles.delta}>{item.delta}</Text> : null}
                </View>
              ))}
            </View>
          )}
          <Text style={styles.helper}>{celebrationHelper}</Text>
          {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
          <Button
            onPress={() => dispatch({
              hasCommunityPost,
              type: "continueCelebration",
            })}
          >
            {hasCommunityPost ? prCopy.continue : (hasGoals ? goalCopy.noPostPrimary : prCopy.noPostPrimary)}
          </Button>
        </View>
      </Dialog>

      <BottomSheet
        closeLabel="Close"
        onDismiss={dismiss}
        onHidden={presenterHidden}
        title={crewName ? (hasGoals ? goalCopy.shareTitle(crewName) : prCopy.shareTitle(crewName)) : prCopy.sharePrimary}
        visible={state.presenter === "share"}
      >
        <View style={styles.stack}>
          <Text style={styles.body}>{shareBody}</Text>
          {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
          <Button loading={state.busy} onPress={() => void share()}>
            {prCopy.sharePrimary}
          </Button>
          <Button disabled={state.busy} onPress={dismiss} variant="secondary">
            {prCopy.shareSecondary}
          </Button>
          <Text style={styles.helper}>{prCopy.shareHelper}</Text>
        </View>
      </BottomSheet>
    </>
  );
}

function SingleGoalBody({ goal }: { goal: GoalReached }) {
  return (
    <View style={styles.singleBody}>
      <Text style={styles.singleLabel}>{goal.title}</Text>
      <Text style={styles.singleValue}>{goal.resultLine} · {goal.targetLine}</Text>
    </View>
  );
}

function SinglePrBody({ pr }: { pr: DetectedPr }) {
  return (
    <View style={styles.singleBody}>
      <Text style={styles.singleLabel}>{pr.label}</Text>
      <Text style={styles.singleValue}>{pr.value}</Text>
      {pr.delta ? (
        <View style={styles.deltaChip}>
          <Text style={styles.delta}>{pr.delta}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  body: {
    color: colors.inkSoft,
    ...type.bodySmall,
  },
  promptResult: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  promptTitle: {
    color: colors.ink,
    ...type.section,
  },
  promptValue: {
    color: colors.inkSoft,
    ...type.bodySmall,
  },
  error: {
    color: colors.danger,
    ...type.bodySmall,
  },
  celebration: {
    gap: spacing.md,
  },
  dialogCloseRow: {
    marginBottom: spacing.xs,
    marginLeft: -spacing.sm,
    marginTop: -spacing.sm,
  },
  check: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: size.avatars.lg,
    justifyContent: "center",
    width: size.avatars.lg,
  },
  celebrationTitle: {
    color: colors.ink,
    textAlign: "center",
    ...type.title,
  },
  autoChip: {
    alignSelf: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.boardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  autoChipText: {
    color: colors.brandPressed,
    ...type.micro,
  },
  helper: {
    color: colors.muted,
    textAlign: "center",
    ...type.bodySmall,
  },
  singleBody: {
    alignItems: "center",
    gap: spacing.xs,
  },
  singleLabel: {
    color: colors.ink,
    ...type.section,
  },
  singleValue: {
    color: colors.ink,
    ...type.heading,
  },
  deltaChip: {
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  delta: {
    color: colors.success,
    ...type.micro,
  },
  multiList: {
    gap: spacing.sm,
  },
  multiHelper: {
    color: colors.muted,
    ...type.bodySmall,
  },
  multiRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  miniChip: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  miniChipText: {
    color: colors.brandPressed,
    ...type.micro,
  },
  miniGoalChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderRadius: radii.sm,
    borderWidth: 2,
    height: spacing.xl,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  combined: {
    color: colors.ink,
    textAlign: "center",
    ...type.section,
  },
  multiCopy: {
    flex: 1,
  },
});
