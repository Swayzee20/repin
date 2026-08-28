import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "./theme";

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
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [value, visible]);

  const handleChange = (event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === "android") {
      if (event.type === "set" && next) onChange(next);
      onDismiss();
      return;
    }
    if (next) setDraft(next);
  };

  if (!visible) return null;
  if (Platform.OS === "android") {
    return <DateTimePicker maximumDate={maximumDate} mode="date" onChange={handleChange} value={value} />;
  }

  return (
    <Modal animationType="fade" onRequestClose={onDismiss} presentationStyle="overFullScreen" transparent visible>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close date picker" accessibilityRole="button" onPress={onDismiss} style={StyleSheet.absoluteFill} />
        <View style={styles.panel}>
          <Text style={styles.title}>Choose a day</Text>
          <DateTimePicker display="inline" maximumDate={maximumDate} mode="date" onChange={handleChange} value={draft} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.action}><Text style={styles.secondaryAction}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { onChange(draft); onDismiss(); }} style={styles.action}><Text style={styles.primaryAction}>Done</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: "center", backgroundColor: "rgba(34,34,34,0.28)", flex: 1, justifyContent: "center", padding: spacing.xxl },
  panel: { backgroundColor: colors.surface, borderRadius: radii.lg, maxWidth: 420, padding: spacing.lg, width: "100%" },
  title: { color: colors.ink, ...type.heading },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.md },
  action: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  secondaryAction: { color: colors.muted, ...type.label },
  primaryAction: { color: colors.brand, ...type.label },
});
