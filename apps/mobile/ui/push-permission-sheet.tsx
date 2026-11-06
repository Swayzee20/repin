import { pushCopy } from "@repin/validation";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./components";
import { BottomSheet } from "./sheet";
import { colors, spacing, type } from "./theme";

export function PushPermissionSheet({
  onAllow,
  onDismiss,
  pending = false,
  visible,
}: {
  onAllow: () => void;
  onDismiss: () => void;
  pending?: boolean;
  visible: boolean;
}) {
  return (
    <BottomSheet
      onDismiss={onDismiss}
      title={pushCopy.prePrompt.title}
      visible={visible}
    >
      <Text style={styles.body}>{pushCopy.prePrompt.body}</Text>
      <View style={styles.stack}>
        <Button
          loading={pending}
          loadingLabel="Turning on"
          onPress={onAllow}
        >
          {pushCopy.prePrompt.primary}
        </Button>
        <Button disabled={pending} onPress={onDismiss} variant="tonal">
          {pushCopy.prePrompt.secondary}
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.inkSoft, ...type.body, marginBottom: spacing.xl },
  stack: { gap: spacing.sm },
});
