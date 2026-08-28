import { createElement, useEffect, useState, type ChangeEvent } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { fromLocalDateInputValue, toLocalDateInputValue } from "../lib/community-date";
import { colors, fonts, radii, spacing, type } from "./theme";

export function CommunityDatePicker({
  maximumDate,
  onChange,
  onDismiss,
  value,
  visible,
}: {
  maximumDate: Date;
  onChange: (value: Date) => void;
  onDismiss: () => void;
  value: Date;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(() => toLocalDateInputValue(value));
  useEffect(() => { if (visible) setDraft(toLocalDateInputValue(value)); }, [value, visible]);
  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onDismiss} presentationStyle="overFullScreen" transparent visible>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close date picker" accessibilityRole="button" onPress={onDismiss} style={StyleSheet.absoluteFill} />
        <View style={styles.panel}>
          <Text style={styles.title}>Choose a day</Text>
          {createElement("input", {
            "aria-label": "Community date",
            max: toLocalDateInputValue(maximumDate),
            onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value),
            style: webInputStyle,
            type: "date",
            value: draft,
          })}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.action}><Text style={styles.secondaryAction}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { const next = fromLocalDateInputValue(draft); if (next) onChange(next); onDismiss(); }} style={styles.action}><Text style={styles.primaryAction}>Done</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const webInputStyle = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.input,
  color: colors.ink,
  fontFamily: fonts.regular,
  fontSize: 16,
  height: 48,
  marginTop: spacing.lg,
  padding: `0 ${spacing.lg}px`,
  width: "100%",
};

const styles = StyleSheet.create({
  overlay: { alignItems: "center", backgroundColor: "rgba(34,34,34,0.28)", flex: 1, justifyContent: "center", padding: spacing.xxl },
  panel: { backgroundColor: colors.surface, borderRadius: radii.lg, maxWidth: 420, padding: spacing.lg, width: "100%" },
  title: { color: colors.ink, ...type.heading },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.md },
  action: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  secondaryAction: { color: colors.muted, ...type.label },
  primaryAction: { color: colors.brand, ...type.label },
});
