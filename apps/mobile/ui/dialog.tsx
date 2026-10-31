import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { CenteredCard } from "./layout";
import { colors, elevation, radii, spacing } from "./theme";

export function Dialog({
  children,
  closeLabel = "Close",
  dismissDisabled = false,
  onDismiss,
  visible,
}: {
  children: ReactNode;
  closeLabel?: string;
  dismissDisabled?: boolean;
  onDismiss: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!dismissDisabled) onDismiss();
      }}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          disabled={dismissDisabled}
          onPress={onDismiss}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
        <CenteredCard>
          <View accessibilityViewIsModal style={styles.panel}>
            {children}
          </View>
        </CenteredCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { backgroundColor: colors.overlay },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    boxShadow: elevation.e3,
    gap: spacing.sm,
    padding: spacing.lg,
    width: "100%",
  },
});
