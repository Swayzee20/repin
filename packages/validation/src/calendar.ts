const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function isValidTimeZone(timeZone: string) {
  if (!timeZone.trim() || timeZone.length > 64) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatter(timeZone: string) {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, created);
  return created;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: weekdayIndex[value("weekday") ?? "Sun"] ?? 0,
  };
}

export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(new Date(instant), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const delta = desired - observedAsUtc;
    if (delta === 0) return new Date(instant);
    instant += delta;
  }
  return new Date(instant);
}

export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
) {
  const utc = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  const next = new Date(utc);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function startOfZonedDay(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return zonedLocalToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

export function addZonedDays(date: Date, days: number, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const next = addCalendarDays(parts.year, parts.month, parts.day, days);
  return zonedLocalToUtc(
    next.year,
    next.month,
    next.day,
    parts.hour,
    parts.minute,
    parts.second,
    timeZone,
  );
}

/** Device-local Sunday 00:00 through next Sunday 00:00 (exclusive) from a UTC offset. */
export function sundayWeekBoundsFromOffset(now: Date, timezoneOffsetMinutes: number) {
  const dayMs = 24 * 60 * 60 * 1_000;
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const daysSinceSunday = local.getUTCDay();
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const todayStart = localMidnightUtc + timezoneOffsetMinutes * 60_000;
  const weekStart = new Date(todayStart - daysSinceSunday * dayMs);
  const weekEnd = new Date(weekStart.getTime() + 7 * dayMs);
  return { weekStart, weekEnd };
}

/** Device-local Sunday 00:00 through next Sunday 00:00 (exclusive), IANA calendar. */
export function sundayWeekBounds(instant: Date, timeZone: string) {
  const parts = zonedParts(instant, timeZone);
  const startDay = addCalendarDays(parts.year, parts.month, parts.day, -parts.weekday);
  const weekStart = zonedLocalToUtc(startDay.year, startDay.month, startDay.day, 0, 0, 0, timeZone);
  const endDay = addCalendarDays(startDay.year, startDay.month, startDay.day, 7);
  const weekEnd = zonedLocalToUtc(endDay.year, endDay.month, endDay.day, 0, 0, 0, timeZone);
  return { weekStart, weekEnd };
}

export function monthBounds(instant: Date, timeZone: string) {
  const parts = zonedParts(instant, timeZone);
  const monthStart = zonedLocalToUtc(parts.year, parts.month, 1, 0, 0, 0, timeZone);
  const nextMonth = parts.month === 12
    ? { year: parts.year + 1, month: 1 }
    : { year: parts.year, month: parts.month + 1 };
  const monthEnd = zonedLocalToUtc(nextMonth.year, nextMonth.month, 1, 0, 0, 0, timeZone);
  return { monthStart, monthEnd };
}

export function exclusiveDeadlineAtEndOfLocalDay(date: Date, timeZone: string) {
  return addZonedDays(startOfZonedDay(date, timeZone), 1, timeZone);
}

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatZonedYmd(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function inclusiveCalendarDate(exclusiveDeadline: Date, timeZone: string) {
  return addZonedDays(exclusiveDeadline, -1, timeZone);
}

export function inclusiveCalendarYmd(exclusiveDeadline: Date, timeZone: string) {
  return formatZonedYmd(inclusiveCalendarDate(exclusiveDeadline, timeZone), timeZone);
}

export function zonedDayDiff(from: Date, to: Date, timeZone: string) {
  const start = startOfZonedDay(from, timeZone);
  const end = startOfZonedDay(to, timeZone);
  let days = 0;
  let cursor = start;
  const direction = end >= start ? 1 : -1;
  while ((direction > 0 ? cursor < end : cursor > end) && days < 4_000) {
    cursor = addZonedDays(cursor, direction, timeZone);
    days += 1;
  }
  return days * direction;
}

export function exclusiveDeadlineFromInput(
  input: Date | string,
  timeZone: string,
) {
  if (typeof input === "string") {
    const dateOnly = dateOnlyPattern.exec(input);
    if (dateOnly) {
      const start = zonedLocalToUtc(
        Number(dateOnly[1]),
        Number(dateOnly[2]),
        Number(dateOnly[3]),
        0,
        0,
        0,
        timeZone,
      );
      return addZonedDays(start, 1, timeZone);
    }
    return exclusiveDeadlineAtEndOfLocalDay(new Date(input), timeZone);
  }
  return exclusiveDeadlineAtEndOfLocalDay(input, timeZone);
}

export function calendarDateFromInput(input: Date | string, timeZone: string) {
  if (typeof input === "string" && dateOnlyPattern.test(input)) return input;
  const date = typeof input === "string" ? new Date(input) : input;
  return formatZonedYmd(date, timeZone);
}
