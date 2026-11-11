import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { WorkoutType } from "@repin/types";
import {
  dashboardSportFilterOptions,
  formatZonedYmd,
  profileDashboardCopy,
} from "@repin/validation";

import { Button } from "./components";
import { CommunityDatePicker } from "./community-date-picker";
import { BottomSheet, SheetRow } from "./sheet";
import { colors, fonts, spacing, type } from "./theme";

export type WorkoutFilterValue = {
  sport: WorkoutType | null;
  from: string | null;
  to: string | null;
};

export function filterLabel(filter: WorkoutFilterValue) {
  if (filter.sport) {
    const option = dashboardSportFilterOptions.find((item) => item.value === filter.sport);
    return option?.label ?? profileDashboardCopy.filter;
  }
  return profileDashboardCopy.allSports;
}

export function WorkoutFilterSheet({
  onApply,
  onDismiss,
  timeZone,
  value,
  visible,
}: {
  onApply: (next: WorkoutFilterValue) => void;
  onDismiss: () => void;
  timeZone: string;
  value: WorkoutFilterValue;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const fromDate = draft.from ? new Date(`${draft.from}T12:00:00`) : new Date();
  const toDate = draft.to ? new Date(`${draft.to}T12:00:00`) : new Date();
  const datesLabel = draft.from && draft.to
    ? `${draft.from} – ${draft.to}`
    : profileDashboardCopy.anyDates;

  return (
    <>
      <BottomSheet
        closeLabel="Close filter workouts"
        full
        onDismiss={onDismiss}
        title={profileDashboardCopy.filterTitle}
        visible={visible}
      >
        {(close) => (
          <View style={styles.body}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
              <Text style={styles.section}>{profileDashboardCopy.filterDates}</Text>
              <SheetRow
                accessibilityLabel={`${profileDashboardCopy.filterDates}, ${datesLabel}`}
                onPress={() => setPicking("from")}
                selected={!draft.from}
              >
                <Text style={styles.rowLabel}>{datesLabel}</Text>
              </SheetRow>
              {draft.from ? (
                <SheetRow
                  accessibilityLabel="Clear dates"
                  onPress={() => setDraft((current) => ({ ...current, from: null, to: null }))}
                >
                  <Text style={styles.rowLabel}>{profileDashboardCopy.anyDates}</Text>
                </SheetRow>
              ) : null}
              <Text style={[styles.section, styles.sports]}>Sport</Text>
              {dashboardSportFilterOptions.map((option) => {
                const selected = draft.sport === option.value;
                return (
                  <SheetRow
                    accessibilityLabel={option.label}
                    key={option.label}
                    onPress={() => setDraft((current) => ({ ...current, sport: option.value }))}
                    selected={selected}
                  >
                    <Text style={[styles.rowLabel, selected && styles.selected]}>{option.label}</Text>
                  </SheetRow>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <Button
                onPress={() => {
                  onApply(draft);
                  close();
                }}
              >
                {profileDashboardCopy.showWorkouts}
              </Button>
            </View>
          </View>
        )}
      </BottomSheet>
      <CommunityDatePicker
        maximumDate={new Date()}
        onChange={(next) => {
          const ymd = formatZonedYmd(next, timeZone);
          if (picking === "from") {
            setDraft((current) => ({
              ...current,
              from: ymd,
              to: current.to && current.to < ymd ? ymd : current.to ?? ymd,
            }));
            setPicking("to");
            return;
          }
          setDraft((current) => ({
            ...current,
            from: current.from ?? ymd,
            to: ymd,
          }));
          setPicking(null);
        }}
        onDismiss={() => setPicking(null)}
        value={picking === "to" ? toDate : fromDate}
        visible={picking != null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  scroll: { flex: 1 },
  section: { color: colors.brandPressed, marginBottom: spacing.sm, marginTop: spacing.lg, ...type.eyebrow },
  sports: { marginTop: spacing.xxl },
  rowLabel: { color: colors.ink, flex: 1, ...type.body, fontFamily: fonts.semibold },
  selected: { color: colors.brandPressed },
  footer: { paddingTop: spacing.lg },
});
