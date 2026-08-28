export function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addLocalDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

export function getLocalDayRange(value: Date) {
  const start = startOfLocalDay(value);
  return { start, end: addLocalDays(start, 1) };
}

export function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function formatCommunityDayLabel(value: Date, today = new Date()) {
  const selected = startOfLocalDay(value);
  const current = startOfLocalDay(today);
  if (isSameLocalDay(selected, current)) return "Today";
  if (isSameLocalDay(selected, addLocalDays(current, -1))) return "Yesterday";
  return selected.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: selected.getFullYear() === current.getFullYear() ? undefined : "numeric",
  });
}

export function toLocalDateInputValue(value: Date) {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromLocalDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
