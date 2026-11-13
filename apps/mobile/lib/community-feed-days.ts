import type { CommunityFeedItem } from "@repin/types";
import { addZonedDays, formatZonedYmd, startOfZonedDay, zonedParts } from "@repin/validation";

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const weekdayLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const monthShort = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const monthLong = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type CommunityBoardDayRow = {
  type: "day";
  accessibilityLabel: string;
  dayKey: string;
  key: string;
  label: string;
};

export type CommunityBoardPostRow = {
  type: "post";
  item: CommunityFeedItem;
  key: string;
  timestamp: string;
};

export type CommunityBoardRow = CommunityBoardDayRow | CommunityBoardPostRow;

/** IANA zone the Community board already uses for local grouping (device calendar). */
export function communityDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function communityItemCreatedAt(item: Pick<CommunityFeedItem, "createdAt">): Date | null {
  if (!item.createdAt) return null;
  const date = new Date(item.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function communityDayKey(date: Date, timeZone: string) {
  return formatZonedYmd(date, timeZone);
}

function formatClock(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const minute = String(parts.minute).padStart(2, "0");
  const suffix = parts.hour < 12 ? "AM" : "PM";
  return `${hour12}:${minute} ${suffix}`;
}

function withEditedSuffix(label: string, editedAt?: string | null) {
  return editedAt ? `${label} · Edited` : label;
}

function isCurrentZonedYear(date: Date, now: Date, timeZone: string) {
  return zonedParts(date, timeZone).year === zonedParts(now, timeZone).year;
}

function isZonedToday(date: Date, now: Date, timeZone: string) {
  return communityDayKey(date, timeZone) === communityDayKey(now, timeZone);
}

function isZonedYesterday(date: Date, now: Date, timeZone: string) {
  const yesterday = addZonedDays(startOfZonedDay(now, timeZone), -1, timeZone);
  return communityDayKey(date, timeZone) === communityDayKey(yesterday, timeZone);
}

function datedLabel(date: Date, timeZone: string, weekday: readonly string[], month: readonly string[], includeYear: boolean) {
  const parts = zonedParts(date, timeZone);
  const base = `${weekday[parts.weekday]}, ${month[parts.month]} ${parts.day}`;
  return includeYear ? `${base}, ${parts.year}` : base;
}

export function formatCommunityBoardDayLabel(date: Date, now: Date, timeZone: string) {
  if (isZonedToday(date, now, timeZone)) return "Today";
  if (isZonedYesterday(date, now, timeZone)) return "Yesterday";
  return datedLabel(date, timeZone, weekdayShort, monthShort, !isCurrentZonedYear(date, now, timeZone));
}

export function formatCommunityBoardDayA11y(date: Date, now: Date, timeZone: string) {
  if (isZonedToday(date, now, timeZone)) return "Today";
  if (isZonedYesterday(date, now, timeZone)) return "Yesterday";
  return datedLabel(date, timeZone, weekdayLong, monthLong, !isCurrentZonedYear(date, now, timeZone));
}

export function formatCommunityBoardTime(date: Date, timeZone: string, editedAt?: string | null) {
  return withEditedSuffix(formatClock(date, timeZone), editedAt);
}

export function formatCommunityPinnedTimestamp(date: Date, timeZone: string, editedAt?: string | null) {
  const parts = zonedParts(date, timeZone);
  const label = `${weekdayShort[parts.weekday]}, ${monthShort[parts.month]} ${parts.day}, ${formatClock(date, timeZone)}`;
  return withEditedSuffix(label, editedAt);
}

export function buildCommunityBoardRows(input: {
  items: readonly CommunityFeedItem[];
  now: Date;
  pinnedPostId?: string | null;
  timeZone: string;
}): CommunityBoardRow[] {
  const rows: CommunityBoardRow[] = [];
  let lastDayKey: string | null = null;
  for (const item of input.items) {
    if (input.pinnedPostId && item.id === input.pinnedPostId) continue;
    const created = communityItemCreatedAt(item);
    const key = `post:${item.kind ?? "workout"}:${item.id}`;
    if (!created) {
      lastDayKey = null;
      rows.push({ type: "post", item, key, timestamp: "Date unavailable" });
      continue;
    }
    const dayKey = communityDayKey(created, input.timeZone);
    if (dayKey !== lastDayKey) {
      rows.push({
        type: "day",
        accessibilityLabel: formatCommunityBoardDayA11y(created, input.now, input.timeZone),
        dayKey,
        key: `day:${dayKey}`,
        label: formatCommunityBoardDayLabel(created, input.now, input.timeZone),
      });
      lastDayKey = dayKey;
    }
    rows.push({
      type: "post",
      item,
      key,
      timestamp: formatCommunityBoardTime(
        created,
        input.timeZone,
        item.kind === "general" ? item.editedAt : null,
      ),
    });
  }
  return rows;
}
