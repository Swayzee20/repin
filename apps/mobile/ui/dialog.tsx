import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { CenteredCard } from "./layout";
import { colors, elevation, radii, spacing } from "./theme";
import { useOverlayOccupancy } from "./use-overlay-occupancy";

export function Dialog({
  children,
  closeLabel = "Close",
  dismissDisabled = false,
  maxWidth,
  onDismiss,
  onHidden,
  padding = spacing.lg,
  size = "default",
  visible,
}: {
  children: ReactNode;
  closeLabel?: string;
  dismissDisabled?: boolean;
  maxWidth?: number;
  onDismiss: () => void;
  /** Fires after the native Modal is gone. Use this to present the next overlay. */
  onHidden?: () => void;
  padding?: number;
  /** Wide uses a 32pt card inset so a 7-column grid fits. Default stays 48. */
  size?: "default" | "wide";
  visible: boolean;
}) {
  const cardInset = size === "wide" ? spacing.lg * 2 : undefined;
  const { onNativeDismiss } = useOverlayOccupancy(visible, onHidden);
  return (
    <Modal
      animationType="fade"
      onDismiss={onNativeDismiss}
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
        <CenteredCard cardInset={cardInset}>
          <View
            accessibilityViewIsModal
            style={[
              styles.panel,
              { padding },
              maxWidth != null ? { maxWidth, width: "100%" } : null,
            ]}
          >
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
    width: "100%",
  },
});
