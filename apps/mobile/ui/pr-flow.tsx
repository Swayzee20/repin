import type { DetectedPr, PrDetectionResult } from "@repin/types";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { answerPrPrompts, mergeCelebrated, shareSessionPrs } from "../lib/pr-api";
import { Button } from "./components";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { prCelebrationAnnouncement, prCopy } from "./pr-copy";
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
  const [promptIndex, setPromptIndex] = useState(0);
  const [celebrated, setCelebrated] = useState<DetectedPr[]>(detection?.detected ?? []);
  const [step, setStep] = useState<"prompt" | "celebration" | "share">(
    detection?.prompts.length ? "prompt" : "celebration",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipPromptDismiss = useRef(false);

  useEffect(() => {
    skipPromptDismiss.current = false;
    setPromptIndex(0);
    setCelebrated(detection?.detected ?? []);
    setStep(detection?.prompts.length ? "prompt" : "celebration");
    setError(null);
  }, [detection]);

  if (!detection) return null;
  if (!detection.prompts.length && !detection.detected.length) return null;

  const prompt = detection.prompts[promptIndex];
  const finish = () => {
    if (busy) return;
    skipPromptDismiss.current = true;
    onFinished();
  };

  const answerPrompt = async (confirmed: boolean) => {
    if (!prompt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await answerPrPrompts(groupId, sessionId, [{
        confirmed,
        key: prompt.key,
        kind: prompt.kind,
      }]);
      const merged = mergeCelebrated(celebrated, next.detected);
      setCelebrated(merged);
      if (promptIndex + 1 < detection.prompts.length) {
        setPromptIndex((index) => index + 1);
      } else if (merged.length) {
        skipPromptDismiss.current = true;
        setStep("celebration");
      } else {
        skipPromptDismiss.current = true;
        onFinished();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save that answer.");
    } finally {
      setBusy(false);
    }
  };

  const continueFromCelebration = () => {
    if (detection.communityPostId) {
      setStep("share");
      return;
    }
    onFinished();
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await shareSessionPrs(groupId, sessionId);
      onFinished();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not share that PR.");
    } finally {
      setBusy(false);
    }
  };

  const promptVisible = step === "prompt" && Boolean(prompt);
  const celebrationVisible = step === "celebration" || step === "share";
  const shareVisible = step === "share";
  const summary = celebrated.map((item) => `${item.label} ${item.value}`).join(", ");
  const single = celebrated.length === 1 ? celebrated[0] : null;

  return (
    <>
      <BottomSheet
        closeLabel="Close"
        onDismiss={() => {
          if (skipPromptDismiss.current) return;
          void answerPrompt(false);
        }}
        title={prCopy.promptTitle}
        visible={promptVisible}
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
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button loading={busy} onPress={() => void answerPrompt(true)}>
              {prCopy.promptPrimary}
            </Button>
            <Button disabled={busy} onPress={() => void answerPrompt(false)} variant="secondary">
              {prCopy.promptSecondary}
            </Button>
          </View>
        ) : null}
      </BottomSheet>

      <Dialog
        closeLabel="Close"
        onDismiss={finish}
        padding={spacing.xl}
        visible={celebrationVisible && !promptVisible}
      >
        <View
          accessibilityLabel={prCelebrationAnnouncement(summary)}
          accessible
          style={styles.celebration}
        >
          <View style={styles.dialogCloseRow}>
            <RoundIconButton accessibilityLabel="Close" kind="close" onPress={finish} />
          </View>
          <View style={styles.check}>
            <Icon color={colors.success} name="checkmark" size={size.icon.md} />
          </View>
          <Text style={styles.celebrationTitle}>{prCopy.celebrationTitle(celebrated.length)}</Text>
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
              {celebrated.map((item) => (
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
          {detection.communityPostId ? (
            <Text style={styles.helper}>{prCopy.celebrationHelper}</Text>
          ) : (
            <Text style={styles.helper}>{prCopy.noPostHelper}</Text>
          )}
          {error && !shareVisible ? <Text style={styles.error}>{error}</Text> : null}
          <Button onPress={continueFromCelebration}>
            {detection.communityPostId ? prCopy.continue : prCopy.noPostPrimary}
          </Button>
        </View>
      </Dialog>

      <BottomSheet
        closeLabel="Close"
        onDismiss={finish}
        title={detection.crewName ? prCopy.shareTitle(detection.crewName) : prCopy.sharePrimary}
        visible={shareVisible}
      >
        <View style={styles.stack}>
          <Text style={styles.body}>{prCopy.shareBody}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button loading={busy} onPress={() => void share()}>
            {prCopy.sharePrimary}
          </Button>
          <Button disabled={busy} onPress={finish} variant="secondary">
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
