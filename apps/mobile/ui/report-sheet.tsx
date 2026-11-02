import {
  contentReportReasonDetails,
  contentReportReasonLabels,
  contentReportReasons,
  personFirstName,
  type ContentReportReason,
} from "@repin/types";
import { useEffect, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { sendReport } from "../lib/moderation-api";
import { Button, TextField } from "./components";
import { ChoiceTile } from "./form-fields";
import { Chevron, Icon } from "./icons";
import { reportReasonRowMinHeight } from "./overlay-state";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, fonts, radii, size, spacing, type } from "./theme";

export type ReportTarget = {
  displayName: string;
  kind: "comment" | "post";
  targetId: string;
  userId: string;
};

const networkError = "Couldn't send. Check your connection and try again.";
const missingDetailsError = "Add a few words so we can look into it.";

export function ReportSheet({
  onBlocked,
  onDismiss,
  onHidden,
  onOpenBlock,
  target,
}: {
  onBlocked: (userId: string) => void;
  onDismiss: () => void;
  onHidden: () => void;
  onOpenBlock: () => void;
  target: ReportTarget | null;
}) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<"details" | "reasons" | "sent">("reasons");
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStep("reasons");
    setReason(null);
    setDetails("");
    setAlsoBlock(false);
    setPending(false);
    setError(null);
    setBlocked(false);
  }, [target]);

  useEffect(() => {
    if (!target || Platform.OS === "web") return;
    const message = step === "sent" ? "Report sent" : step === "details" ? "Add details" : reportTitle(target.kind);
    AccessibilityInfo.announceForAccessibility(message);
  }, [step, target]);

  const first = personFirstName(target?.displayName);
  const noun = target?.kind === "comment" ? "comment" : "post";
  const detailsRequired = reason === "other";
  const trimmed = details.trim();
  const canSend = Boolean(reason) && (!detailsRequired || trimmed.length > 0);

  const submit = async () => {
    if (!target || !reason || pending) return;
    if (detailsRequired && !trimmed) {
      setError(missingDetailsError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await sendReport({
        alsoBlock,
        details: trimmed,
        reason,
        targetId: target.targetId,
        targetType: target.kind,
      });
      onHidden();
      if (result.blocked || alsoBlock) {
        setBlocked(true);
        onBlocked(target.userId);
      }
      setStep("sent");
    } catch {
      setError(networkError);
    } finally {
      setPending(false);
    }
  };

  const title = step === "sent" ? "Report sent" : reportTitle(target?.kind ?? "post");

  return (
    <BottomSheet closeLabel="Close" onDismiss={onDismiss} title={title} visible={target !== null}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={reducedMotion ? undefined : styles.step}>
          {step === "reasons" && target ? (
            <View style={styles.stack}>
              <Text style={styles.intro}>Why are you reporting this {noun}? {first} won't know it was you.</Text>
              {contentReportReasons.map((option) => (
                <SheetRow
                  accessibilityLabel={`${contentReportReasonLabels[option]}. ${contentReportReasonDetails[option]}`}
                  divider
                  key={option}
                  minHeight={reportReasonRowMinHeight}
                  onPress={() => {
                    setReason(option);
                    setError(null);
                    setStep("details");
                  }}
                >
                  <View style={styles.reasonCopy}>
                    <Text style={styles.reasonTitle}>{contentReportReasonLabels[option]}</Text>
                    <Text style={styles.reasonDetail}>{contentReportReasonDetails[option]}</Text>
                  </View>
                  <Chevron color={colors.brand} />
                </SheetRow>
              ))}
            </View>
          ) : null}
          {step === "details" && reason ? (
            <View style={styles.stack}>
              <Pressable
                accessibilityLabel={`${contentReportReasonLabels[reason]}. Change`}
                accessibilityRole="button"
                onPress={() => setStep("reasons")}
                style={styles.changeRow}
              >
                <View style={styles.reasonCopy}>
                  <Text style={styles.reasonTitle}>{contentReportReasonLabels[reason]}</Text>
                  <Text style={styles.change}>Change</Text>
                </View>
                <Chevron color={colors.brand} />
              </Pressable>
              <TextField
                error={error === missingDetailsError ? error : null}
                hint="Only the repin team sees this."
                label={detailsRequired ? "What's going on?" : "Anything else we should know?"}
                maxLength={500}
                multiline
                onChangeText={(value) => {
                  setDetails(value.slice(0, 500));
                  if (error === missingDetailsError) setError(null);
                }}
                optional={!detailsRequired}
                placeholder="Add details"
                value={details}
              />
              <Text style={styles.counter}>{trimmed.length}/500</Text>
              <ChoiceTile
                accessibilityLabel={`Also block ${first}. You won't see each other's posts or comments.`}
                label={`Also block ${first}`}
                onPress={() => setAlsoBlock((current) => !current)}
                role="checkbox"
                selected={alsoBlock}
              />
              <Text style={styles.helper}>You won't see each other's posts or comments.</Text>
              {error && error !== missingDetailsError ? (
                <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
              ) : null}
              <Button
                disabled={!canSend}
                disabledReason={detailsRequired && !trimmed ? "Add a few words to send." : undefined}
                loading={pending}
                loadingLabel="Sending"
                onPress={() => void submit()}
              >
                Send report
              </Button>
            </View>
          ) : null}
          {step === "sent" && target ? (
            <View style={styles.stack}>
              <View accessibilityLiveRegion="polite" style={styles.sent}>
                <View style={styles.badge}><Icon color={colors.success} name="checkmark" size={size.icon.md} /></View>
                <Text accessibilityRole="header" style={styles.sentHeading}>Thanks for letting us know</Text>
                <Text style={styles.body}>The repin team will review it within 24 hours. You won't see this {noun} while we look into it.</Text>
                <Text style={styles.body}>{first} won't know you reported them.</Text>
              </View>
              {reason === "violence_self_harm" ? (
                <View style={styles.helpCard}>
                  <Text style={styles.help}>If someone might hurt themselves, call or text 988 (US). In an emergency, call 911.</Text>
                </View>
              ) : null}
              {blocked ? (
                <View style={styles.blockedLine}>
                  <Icon color={colors.success} name="checkmark" />
                  <Text style={styles.body}>You blocked {first}.</Text>
                </View>
              ) : (
                <Button onPress={onOpenBlock} variant="secondary">{`Block ${first}`}</Button>
              )}
              <Button onPress={onDismiss}>Done</Button>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

function reportTitle(kind: "comment" | "post") {
  return kind === "comment" ? "Report comment" : "Report post";
}

const styles = StyleSheet.create({
  step: { gap: spacing.md },
  stack: { gap: spacing.md },
  intro: { color: colors.inkSoft, ...type.body },
  reasonCopy: { flex: 1, gap: spacing.xs },
  reasonTitle: { ...type.body, color: colors.ink, fontFamily: fonts.semibold },
  reasonDetail: { color: colors.muted, ...type.bodySmall },
  changeRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: size.hit },
  change: { ...type.bodySmall, color: colors.brand, fontFamily: fonts.bold },
  counter: { color: colors.muted, textAlign: "right", ...type.bodySmall },
  helper: { color: colors.muted, ...type.bodySmall },
  error: { color: colors.danger, ...type.bodySmall },
  sent: { gap: spacing.sm },
  badge: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: size.avatars.lg,
    justifyContent: "center",
    width: size.avatars.lg,
  },
  sentHeading: { color: colors.ink, ...type.heading },
  body: { color: colors.inkSoft, ...type.body },
  helpCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  help: { ...type.body, color: colors.ink, fontFamily: fonts.semibold },
  blockedLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
});
