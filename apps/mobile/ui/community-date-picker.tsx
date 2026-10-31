import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";

import { DatePickerActions } from "./date-picker-actions";
import { Dialog } from "./dialog";
import { colors, type } from "./theme";

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
    <Dialog closeLabel="Close date picker" onDismiss={onDismiss} visible>
      <Text style={styles.title}>Choose a day</Text>
      <DateTimePicker display="inline" maximumDate={maximumDate} mode="date" onChange={handleChange} value={draft} />
      <DatePickerActions onCancel={onDismiss} onDone={() => { onChange(draft); onDismiss(); }} />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, ...type.heading },
});
