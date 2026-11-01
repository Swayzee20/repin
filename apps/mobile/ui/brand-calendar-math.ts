import { calendar, colors, type } from "./theme";

export const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export type MonthCell = {
  date: Date | null;
  disabled: boolean;
  inMonth: boolean;
  key: string;
  selected: boolean;
  today: boolean;
};

export type DayMarkAppearance = {
  backgroundColor: string;
  borderColor: string;
  color: string;
  emphasis: boolean;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Local YYYY-MM-DD. Same shape as `getLocalDateParts().date`. */
export function localCalendarKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function emptyCell(key: string): MonthCell {
  return {
    date: null,
    disabled: false,
    inMonth: false,
    key,
    selected: false,
    today: false,
  };
}

/**
 * Sunday-first weeks for one month. Leading and trailing cells are empty.
 * Keys are local Y/M/D strings so callers can pass `getLocalDateParts().date`.
 */
export function monthMatrix({
  maximumKey,
  month,
  selectedKey,
  todayKey,
  year,
}: {
  maximumKey: string;
  month: number;
  selectedKey: string;
  todayKey: string;
  year: number;
}): MonthCell[][] {
  const leading = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: MonthCell[] = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push(emptyCell(`lead-${year}-${month}-${index}`));
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = localCalendarKey(year, month, day);
    cells.push({
      date: new Date(year, month, day),
      disabled: key > maximumKey,
      inMonth: true,
      key,
      selected: key === selectedKey,
      today: key === todayKey,
    });
  }
  let trailing = 0;
  while (cells.length % WEEKDAY_LABELS.length !== 0) {
    cells.push(emptyCell(`trail-${year}-${month}-${trailing}`));
    trailing += 1;
  }
  const weeks: MonthCell[][] = [];
  for (let index = 0; index < cells.length; index += WEEKDAY_LABELS.length) {
    weeks.push(cells.slice(index, index + WEEKDAY_LABELS.length));
  }
  return weeks;
}

export function monthArrowState(shownYear: number, shownMonth: number, maximumKey: string) {
  return {
    nextDisabled: nextMonthDisabled(shownYear, shownMonth, maximumKey),
    previousDisabled: false as const,
  };
}

/** Next stops on the month that contains maximumDate, and stays stopped after it. */
export function nextMonthDisabled(shownYear: number, shownMonth: number, maximumKey: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(maximumKey);
  if (!match) return false;
  const maxYear = Number(match[1]);
  const maxMonth = Number(match[2]) - 1;
  return shownYear * 12 + shownMonth >= maxYear * 12 + maxMonth;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { month: next.getMonth(), year: next.getFullYear() };
}

export function monthTitle(year: number, month: number, locale?: string) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(year, month, 1));
}

export function dayAccessibilityLabel(date: Date, today: boolean, locale?: string) {
  const formatted = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  }).format(date);
  return today ? `${formatted}, today` : formatted;
}

/** Light-mode day mark. Every colour is a theme token. No system tint. */
export function dayMarkAppearance({
  disabled,
  pressed,
  selected,
  today,
}: {
  disabled: boolean;
  pressed: boolean;
  selected: boolean;
  today: boolean;
}): DayMarkAppearance {
  if (disabled) {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      color: colors.disabledText,
      emphasis: false,
    };
  }
  if (selected) {
    return {
      backgroundColor: pressed ? colors.brandPressed : colors.brand,
      borderColor: "transparent",
      color: colors.surface,
      emphasis: true,
    };
  }
  if (today) {
    return {
      backgroundColor: pressed ? colors.selection : "transparent",
      borderColor: colors.brand,
      color: colors.brand,
      emphasis: true,
    };
  }
  if (pressed) {
    return {
      backgroundColor: colors.selection,
      borderColor: "transparent",
      color: colors.ink,
      emphasis: false,
    };
  }
  return {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: colors.ink,
    emphasis: false,
  };
}

export const dayMarkSize = calendar.dayMark;
export const dayMarkRing = calendar.dayRing;
export const weekdayRowHeight = type.calendarWeekday.lineHeight;
