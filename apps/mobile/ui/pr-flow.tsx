import type { DetectedPr, PrDetectionResult } from "@repin/types";
import { useEffect, useReducer, useRef } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";

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
  groupId,
  onFinished,
  sessionId,
}: {
  detection: PrDetectionResult | null;
  groupId: string;
  onFinished: () => void;
  sessionId: string;
}) {
  const [state, dispatch] = useReducer(reducePrFlow, detection, initialPrFlowState);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    dispatch({ detection, type: "reset" });
  }, [detection]);

  useEffect(() => {
    if (!state.finished || finishedRef.current) return;
    finishedRef.current = true;
    if (state.notice === "no_post") {
      AccessibilityInfo.announceForAccessibility(prCopy.noPostHelper);
    }
    onFinished();
  }, [onFinished, state.finished, state.notice]);

  if (!detection) return null;
  if (!detection.prompts.length && !detection.detected.length) return null;

  const prompt = detection.prompts[state.promptIndex];
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
        hasMorePrompts: state.promptIndex + 1 < detection.prompts.length,
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
      await shareSessionPrs(groupId, sessionId);
      dispatch({ type: "shareSucceeded" });
    } catch (submitError) {
      dispatch({
        message: submitError instanceof Error ? submitError.message : prCopy.shareFailed,
        type: "shareFailed",
      });
    }
  };

  const summary = state.celebrated.map((item) => `${item.label} ${item.value}`).join(", ");
  const single = state.celebrated.length === 1 ? state.celebrated[0] : null;
  const hasCommunityPost = Boolean(detection.communityPostId);

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
          accessibilityLabel={prCelebrationAnnouncement(summary)}
          accessible
          style={styles.celebration}
        >
          <View style={styles.dialogCloseRow}>
            <RoundIconButton accessibilityLabel="Close" kind="close" onPress={dismiss} />
          </View>
          <View style={styles.check}>
            <Icon color={colors.success} name="checkmark" size={size.icon.md} />
          </View>
          <Text style={styles.celebrationTitle}>{prCopy.celebrationTitle(state.celebrated.length)}</Text>
          {single?.autoDetected ? (
            <View style={styles.autoChip}>
              <Text style={styles.autoChipText}>{prCopy.autoChip}</Text>
            </View>
          ) : null}
          {single ? (
            <SinglePrBody pr={single} />
          ) : (
            <View style={styles.multiList}>
              <Text style={styles.multiHelper}>From this workout — share once to badge the post.</Text>
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
          {hasCommunityPost ? (
            <Text style={styles.helper}>{prCopy.celebrationHelper}</Text>
          ) : (
            <Text style={styles.helper}>{prCopy.noPostHelper}</Text>
          )}
          {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
          <Button
            onPress={() => dispatch({
              hasCommunityPost,
              type: "continueCelebration",
            })}
          >
            {hasCommunityPost ? prCopy.continue : prCopy.noPostPrimary}
          </Button>
        </View>
      </Dialog>

      <BottomSheet
        closeLabel="Close"
        onDismiss={dismiss}
        onHidden={presenterHidden}
        title={detection.crewName ? prCopy.shareTitle(detection.crewName) : prCopy.sharePrimary}
        visible={state.presenter === "share"}
      >
        <View style={styles.stack}>
          <Text style={styles.body}>{prCopy.shareBody}</Text>
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
  multiCopy: {
    flex: 1,
  },
});
