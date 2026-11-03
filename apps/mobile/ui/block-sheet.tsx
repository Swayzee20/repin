import { personFirstName } from "@repin/types";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";

import { blockAccount, unblockAccount } from "../lib/moderation-api";
import { Button } from "./components";
import { Icon } from "./icons";
import { BottomSheet } from "./sheet";
import { colors, radii, size, spacing, type } from "./theme";

export type BlockRequest = {
  displayName: string;
  mode: "block" | "unblock";
  userId: string;
};

export function BlockSheet({
  onBlocked,
  onDismiss,
  onReport,
  onUnblocked,
  request,
}: {
  onBlocked: (userId: string) => void;
  onDismiss: () => void;
  onReport?: () => void;
  onUnblocked: (displayName: string) => void;
  request: BlockRequest | null;
}) {
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = personFirstName(request?.displayName);
  const full = request?.displayName.trim() || first;

  useEffect(() => {
    setStep("confirm");
    setPending(false);
    setError(null);
  }, [request]);

  useEffect(() => {
    if (!request || Platform.OS === "web" || step !== "done") return;
    AccessibilityInfo.announceForAccessibility(request.mode === "block" ? `${first} is blocked` : `${full} unblocked`);
  }, [first, full, request, step]);

  const confirmBlock = async () => {
    if (!request || pending) return;
    setPending(true);
    setError(null);
    try {
      await blockAccount(request.userId);
      onBlocked(request.userId);
      setStep("done");
    } catch {
      setError("Couldn't block. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const confirmUnblock = async () => {
    if (!request || pending) return;
    setPending(true);
    setError(null);
    try {
      await unblockAccount(request.userId);
      onUnblocked(full);
      onDismiss();
    } catch {
      setError("Couldn't unblock. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const title = !request
    ? "Block"
    : request.mode === "unblock"
      ? `Unblock ${first}?`
      : step === "done"
        ? "Blocked"
        : `Block ${first}?`;

  return (
    <BottomSheet closeLabel="Close" onDismiss={onDismiss} title={title} visible={request !== null}>
      {request?.mode === "unblock" ? (
        <View style={styles.stack}>
          <Text style={styles.body}>You'll see each other's posts and comments again. {first} won't be told.</Text>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Button loading={pending} loadingLabel="Unblocking" onPress={() => void confirmUnblock()}>{`Unblock ${first}`}</Button>
        </View>
      ) : null}
      {request?.mode === "block" && step === "confirm" ? (
        <View style={styles.stack}>
          <Text style={styles.body}>You won't see each other's posts, comments, or reactions.</Text>
          <Text style={styles.body}>You both stay in the groups you share.</Text>
          <Text style={styles.body}>{first} won't be told. You can unblock anytime in Settings.</Text>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Button
            loading={pending}
            loadingLabel="Blocking"
            onPress={() => void confirmBlock()}
            variant="danger"
          >
            {`Block ${first}`}
          </Button>
        </View>
      ) : null}
      {request?.mode === "block" && step === "done" ? (
        <View accessibilityLiveRegion="polite" style={styles.stack}>
          <View style={styles.badge}><Icon color={colors.success} name="checkmark" size={size.icon.md} /></View>
          <Text accessibilityRole="header" style={styles.heading}>{first} is blocked</Text>
          <Text style={styles.body}>You won't see {first}'s posts or comments anymore. To undo this, go to Settings, then Blocked accounts.</Text>
          {onReport ? <Button onPress={onReport} variant="secondary">{`Report ${first}`}</Button> : null}
          <Button onPress={onDismiss}>Done</Button>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  body: { color: colors.inkSoft, ...type.body },
  error: { color: colors.danger, ...type.bodySmall },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: size.avatars.lg,
    justifyContent: "center",
    width: size.avatars.lg,
  },
  heading: { color: colors.ink, ...type.heading },
});
