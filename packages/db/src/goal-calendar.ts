import {
  addCalendarDays,
  addZonedDays,
  exclusiveDeadlineAtEndOfLocalDay,
  exclusiveDeadlineFromInput,
  formatZonedYmd,
  inclusiveCalendarDate,
  inclusiveCalendarYmd,
  isValidTimeZone,
  monthBounds,
  startOfZonedDay,
  sundayWeekBounds,
  zonedDayDiff,
  zonedLocalToUtc,
  zonedParts,
  type ZonedParts,
} from "@repin/validation";

export {
  addCalendarDays,
  addZonedDays,
  exclusiveDeadlineAtEndOfLocalDay,
  exclusiveDeadlineFromInput,
  formatZonedYmd,
  inclusiveCalendarDate,
  inclusiveCalendarYmd,
  isValidTimeZone,
  monthBounds,
  startOfZonedDay,
  sundayWeekBounds,
  zonedDayDiff,
  zonedLocalToUtc,
  zonedParts,
  type ZonedParts,
};

export function creditClosesAt(periodEnd: Date | null, timeZone: string) {
  if (!periodEnd) return null;
  return addZonedDays(periodEnd, 7, timeZone);
}

export function weeklyPeriodKey(weekStart: Date, timeZone: string) {
  return formatZonedYmd(weekStart, timeZone);
}

export function monthlyPeriodKey(monthStart: Date, timeZone: string) {
  const parts = zonedParts(monthStart, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function formatShortRange(
  start: Date,
  endExclusive: Date | null,
  timeZone: string,
) {
  const startParts = zonedParts(start, timeZone);
  if (!endExclusive) return formatShortDate(startParts);
  const lastDay = addZonedDays(endExclusive, -1, timeZone);
  const endParts = zonedParts(lastDay, timeZone);
  return `${formatShortDate(startParts)} – ${formatShortDate(endParts)}`;
}

export function formatShortDate(parts: Pick<ZonedParts, "year" | "month" | "day" | "weekday">) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  return `${weekdays[parts.weekday]} ${months[parts.month - 1]} ${parts.day}`;
}

export function formatDueDate(deadlineAt: Date, timeZone: string) {
  const lastDay = addZonedDays(deadlineAt, -1, timeZone);
  const parts = zonedParts(lastDay, timeZone);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  return `${months[parts.month - 1]} ${parts.day}`;
}

export type CalendarPeriod = {
  key: string;
  start: Date;
  end: Date | null;
};

export function currentCalendarPeriod(
  instant: Date,
  timeZone: string,
  schedule: "weekly" | "monthly" | "one_time",
  deadlineAt: Date | null,
): CalendarPeriod {
  if (schedule === "weekly") {
    const { weekStart, weekEnd } = sundayWeekBounds(instant, timeZone);
    return { key: weeklyPeriodKey(weekStart, timeZone), start: weekStart, end: weekEnd };
  }
  if (schedule === "monthly") {
    const { monthStart, monthEnd } = monthBounds(instant, timeZone);
    return { key: monthlyPeriodKey(monthStart, timeZone), start: monthStart, end: monthEnd };
  }
  return { key: "once", start: startOfZonedDay(instant, timeZone), end: deadlineAt };
}
