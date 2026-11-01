import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";

import {
  WEEKDAY_LABELS,
  dayAccessibilityLabel,
  dayMarkAppearance,
  monthArrowState,
  monthMatrix,
  monthTitle,
  shiftMonth,
  type MonthCell,
} from "./brand-calendar-math";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron } from "./icons";
import { calendar, colors, fonts, radii, size, spacing, type } from "./theme";
import { getLocalDateParts } from "./workout-form-frame";

export function BrandCalendar({
  initialDate,
  maximumDate,
  onChange,
  value,
}: {
  /** Month shown when the grid mounts. The committed picker value, not the draft. */
  initialDate: Date;
  maximumDate: Date;
  onChange: (value: Date) => void;
  value: Date;
}) {
  const [shown, setShown] = useState(() => monthFrom(initialDate));
  const title = monthTitle(shown.year, shown.month);
  const announcedTitle = useRef<string | null>(null);
  useEffect(() => {
    if (announcedTitle.current !== null && announcedTitle.current !== title) {
      if (typeof AccessibilityInfo.announceForAccessibility === "function") {
        AccessibilityInfo.announceForAccessibility(title);
      }
    }
    announcedTitle.current = title;
  }, [title]);

  const today = new Date();
  const selectedKey = getLocalDateParts(value).date;
  const todayKey = getLocalDateParts(today).date;
  const maximumKey = getLocalDateParts(maximumDate).date;
  const arrows = monthArrowState(shown.year, shown.month, maximumKey);
  const weeks = monthMatrix({
    maximumKey,
    month: shown.month,
    selectedKey,
    todayKey,
    year: shown.year,
  });

  return (
    <View>
      <View style={styles.monthRow}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.monthLabel}>{title}</Text>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          onPress={() => setShown((current) => shiftMonth(current.year, current.month, -1))}
          style={styles.arrow}
        >
          <Chevron color={colors.brand} direction="left" />
        </Pressable>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          accessibilityState={{ disabled: arrows.nextDisabled }}
          disabled={arrows.nextDisabled}
          onPress={() => setShown((current) => shiftMonth(current.year, current.month, 1))}
          style={styles.arrow}
        >
          <Chevron color={arrows.nextDisabled ? colors.disabledText : colors.brand} direction="right" />
        </Pressable>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.weekdayRow}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>{label}</Text>
        ))}
      </View>
      <View>
        {weeks.map((week) => (
          <View key={week[0]?.key ?? "week"} style={styles.row}>
            {week.map((cell) => (
              <DayCell cell={cell} key={cell.key} onPress={onChange} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function monthFrom(date: Date) {
  const [year, month] = getLocalDateParts(date).date.split("-");
  return { month: Number(month) - 1, year: Number(year) };
}

function DayCell({ cell, onPress }: { cell: MonthCell; onPress: (value: Date) => void }) {
  const date = cell.date;
  if (!cell.inMonth || !date) {
    return <View importantForAccessibility="no" style={styles.cell} />;
  }
  return (
    <Pressable
      accessibilityLabel={dayAccessibilityLabel(date, cell.today)}
      accessibilityRole="button"
      accessibilityState={{ disabled: cell.disabled, selected: cell.selected }}
      disabled={cell.disabled}
      onPress={() => onPress(date)}
      style={(state) => [styles.cell, webFocusRing(pressableFocused(state))]}
    >
      {(state) => {
        const mark = dayMarkAppearance({
          disabled: cell.disabled,
          pressed: state.pressed,
          selected: cell.selected,
          today: cell.today,
        });
        return (
          <View
            style={[
              styles.mark,
              { backgroundColor: mark.backgroundColor, borderColor: mark.borderColor },
            ]}
          >
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.day, mark.emphasis ? styles.dayEmphasis : null, { color: mark.color }]}
            >
              {date.getDate()}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  monthRow: { alignItems: "center", flexDirection: "row", height: size.hit, minHeight: size.hit },
  monthLabel: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
  },
  arrow: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    minHeight: size.hit,
    width: size.hit,
  },
  weekdayRow: {
    flexDirection: "row",
    height: type.calendarWeekday.lineHeight,
    marginVertical: spacing.xs,
  },
  weekday: {
    ...type.calendarWeekday,
    color: colors.muted,
    flex: 1,
    textAlign: "center",
  },
  row: { flexDirection: "row", minHeight: size.hit },
  cell: {
    alignItems: "center",
    flex: 1,
    height: size.hit,
    justifyContent: "center",
    minHeight: size.hit,
  },
  mark: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: calendar.dayRing,
    height: calendar.dayMark,
    justifyContent: "center",
    width: calendar.dayMark,
  },
  day: {
    fontFamily: fonts.medium,
    fontSize: type.cardTitle.fontSize,
    lineHeight: type.cardTitle.lineHeight,
    textAlign: "center",
  },
  dayEmphasis: { fontFamily: fonts.extrabold },
});
