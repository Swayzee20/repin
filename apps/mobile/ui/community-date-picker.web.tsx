import { createElement, useEffect, useState, type ChangeEvent } from "react";
import { StyleSheet, Text } from "react-native";

import { fromLocalDateInputValue, toLocalDateInputValue } from "../lib/community-date";
import { DatePickerActions } from "./date-picker-actions";
import { Dialog } from "./dialog";
import { colors, radii, size, spacing, type } from "./theme";

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
    <Dialog closeLabel="Close date picker" onDismiss={onDismiss} visible>
      <Text style={styles.title}>Choose a day</Text>
      {createElement("input", {
        "aria-label": "Community date",
        max: toLocalDateInputValue(maximumDate),
        onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value),
        style: webInputStyle,
        type: "date",
        value: draft,
      })}
      <DatePickerActions
        onCancel={onDismiss}
        onDone={() => {
          const next = fromLocalDateInputValue(draft);
          if (next) onChange(next);
          onDismiss();
        }}
      />
    </Dialog>
  );
}

const webInputStyle = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  boxSizing: "border-box" as const,
  color: colors.ink,
  fontFamily: type.body.fontFamily,
  fontSize: type.body.fontSize,
  height: size.control,
  marginTop: spacing.sm,
  padding: `0 ${spacing.lg}px`,
  width: "100%",
};

const styles = StyleSheet.create({
  title: { color: colors.ink, ...type.heading },
});
