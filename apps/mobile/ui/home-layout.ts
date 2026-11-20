import {
  HOME_ACTIVITY_LIMIT,
  HOME_GOAL_LIMIT,
  HOME_GOAL_LIMIT_SHORT,
  HOME_HIGHLIGHT_LIMIT,
  HOME_HIGHLIGHT_LIMIT_SHORT,
  HOME_PROMPT_LIMIT_FOLDED,
  HOME_PROMPT_LIMIT_SHORT,
} from "@repin/validation";

export const HOME_SHORT_SCREEN_HEIGHT = 760;

export function homeIsShortScreen(mode: string, height: number) {
  return mode === "compact" && height < HOME_SHORT_SCREEN_HEIGHT;
}

export function homeGoalLimit(mode: string, shortScreen: boolean) {
  if (shortScreen) return HOME_GOAL_LIMIT_SHORT;
  return mode === "twoPane" ? HOME_GOAL_LIMIT : HOME_GOAL_LIMIT_SHORT;
}

export function homePromptLimit(mode: string, shortScreen: boolean) {
  if (mode === "twoPane") return HOME_ACTIVITY_LIMIT;
  if (shortScreen) return HOME_PROMPT_LIMIT_SHORT;
  return HOME_PROMPT_LIMIT_FOLDED;
}

export function homeHighlightLimit(shortScreen: boolean) {
  return shortScreen ? HOME_HIGHLIGHT_LIMIT_SHORT : HOME_HIGHLIGHT_LIMIT;
}

export function homeComingUpInCard(mode: string) {
  return mode === "twoPane";
}

export function homeHighlightsInCrewPane() {
  return true;
}

export function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function buildWeeklyConsistencyDays(workoutOccurredAtThisWeek: string[], now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sunday = new Date(todayStart);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const completedDateKeys = new Set(
    workoutOccurredAtThisWeek
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(getLocalDateKey),
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    const key = getLocalDateKey(date);
    const completed = completedDateKeys.has(key);
    const isToday = date.getTime() === todayStart.getTime();
    const isFuture = date.getTime() > todayStart.getTime();
    const temporalStatus = isToday ? "today, " : isFuture ? "future day, " : "";
    const status = `${temporalStatus}${completed ? "workout completed" : "no workout logged"}`;

    return {
      accessibilityLabel: `${new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(date)}, ${status}`,
      completed,
      isFuture,
      isToday,
      key,
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toLocaleUpperCase(),
    };
  });
}
