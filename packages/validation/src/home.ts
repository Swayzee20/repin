import type { GoalKind, GoalMetric, HomeGoalSnapshot, WorkoutFeedItem } from "@repin/types";
import { personFirstName, resolveUserDisplayName } from "@repin/types";

import {
  formatZonedYmd,
  inclusiveCalendarDate,
  startOfZonedDay,
  sundayWeekBounds,
  zonedDayDiff,
  zonedParts,
} from "./calendar";

export const HOME_ACTIVITY_LIMIT = 5;
export const HOME_GOAL_LIMIT = 3;
export const HOME_GOAL_LIMIT_SHORT = 1;
export const HOME_HIGHLIGHT_LIMIT = 3;
export const HOME_HIGHLIGHT_LIMIT_SHORT = 2;
export const HOME_PROMPT_LIMIT_FOLDED = 3;
export const HOME_PROMPT_LIMIT_SHORT = 1;
export const HOME_RING_LABEL_MAX = 4;
export const HOME_WEEK_END_MAX_DAYS = 3;
export const HOME_DEADLINE_WINDOW_DAYS = 7;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const promptSport: Record<string, string> = {
  run: "run",
  walk: "walk",
  cycling: "ride",
  strength_training: "lift",
  powerlifting: "lift",
  hiit: "hiit",
  functional_fitness: "workout",
  other: "workout",
};

export const homeCopy = {
  greeting: (name: string) => (name.trim() ? `Hey, ${name}` : "Hey"),
  thisWeek: "This week",
  viewGoals: "View goals",
  setWeeklyGoal: "Set a weekly goal",
  comingUp: "Coming up",
  yourCrew: "YOUR CREW",
  highlights: "Highlights",
  activity: "Activity",
  viewAll: "View all",
  firstToRepInToday: "First to rep in today",
  reppedInAtLeast: (name: string, count: number) =>
    `${name} repped in at least ${count} times this week`,
  emptyCrewTitle: "No one's repped in yet",
  emptyCrewBody: "Be the first to rep in",
  noStreak: "No streak yet",
  streak: (weeks: number) => (weeks === 1 ? "1-week streak" : `${weeks}-week streak`),
  daysLeftThisWeek: (days: number) =>
    days === 1 ? "1 day left this week" : `${days} days left this week`,
  thisWeekCount: (count: number) => `${count} this week`,
  errorTitle: "Couldn't load Home",
  crewErrorTitle: "Couldn't load crew",
  errorBody: "Check your connection and try again.",
  tryAgain: "Try again",
  firstOne: "Get that first one in",
  reached: "Goal reached this week",
  crushing: "You're crushing it, 1 left",
  crushingLead: "You're crushing it.",
} as const;

export type HomeGoalNudgeKind = "none" | "first" | "behind" | "one_left" | "reached" | "remaining";

export type HomeGoalRowModel = {
  id: string;
  title: string;
  kind: GoalKind;
  metric: GoalMetric;
  ratio: number;
  reached: boolean;
  percent: number;
  centerLabel: string;
  percentMode: boolean;
  nudge: string | null;
  accessibilityLabel: string;
};

export type HomeDeadlineRow = {
  goalId: string;
  title: string;
  weekday: string;
};

export type HomeComingUp = {
  weekEndLine: string | null;
  deadline: HomeDeadlineRow | null;
};

export function homeStreakLabel(weeks: number) {
  if (weeks <= 0) return homeCopy.noStreak;
  return homeCopy.streak(weeks);
}

export function countWeeklyStreak(weekStartKeys: readonly string[], currentWeekStartKey: string) {
  const set = new Set(weekStartKeys);
  let cursor = currentWeekStartKey;
  if (!set.has(cursor)) cursor = shiftYmd(cursor, -7);
  let weeks = 0;
  while (set.has(cursor)) {
    weeks += 1;
    cursor = shiftYmd(cursor, -7);
  }
  return weeks;
}

export function currentWeekStartKey(now: Date, timeZone: string) {
  return formatZonedYmd(sundayWeekBounds(now, timeZone).weekStart, timeZone);
}

export function selectHomeGoals(goals: readonly HomeGoalSnapshot[], now: Date, limit: number) {
  const weekly: HomeGoalSnapshot[] = [];
  const dueSoon: HomeGoalSnapshot[] = [];
  const monthly: HomeGoalSnapshot[] = [];
  const rest: HomeGoalSnapshot[] = [];
  for (const goal of goals) {
    if (goal.schedule === "weekly") weekly.push(goal);
    else if (goal.schedule === "monthly") monthly.push(goal);
    else if (oneTimeDueWithinDays(goal, now, HOME_DEADLINE_WINDOW_DAYS)) dueSoon.push(goal);
    else rest.push(goal);
  }
  return [...weekly, ...dueSoon, ...monthly, ...rest].slice(0, Math.max(0, limit));
}

export function homeGoalRowModel(goal: HomeGoalSnapshot, now: Date): HomeGoalRowModel {
  const reached = goal.progress.ratio >= 1 || goal.progress.current >= goal.progress.target;
  const percent = nearestPercent(goal.progress.ratio);
  const current = formatRingNumber(goal.currentDisplay);
  const target = formatRingNumber(goal.targetDisplay);
  const ratioLabel = `${current}/${target}`;
  const percentLabel = `${percent}%`;
  const wantsRatio = goal.kind === "volume";
  const percentMode = !wantsRatio || ratioLabel.length > HOME_RING_LABEL_MAX;
  const centerLabel = percentMode ? percentLabel : ratioLabel;
  const remaining = Math.max(0, roundDisplay(goal.targetDisplay - goal.currentDisplay));
  const nudgeKind = volumeNudgeKind({
    kind: goal.kind,
    current: goal.currentDisplay,
    remaining,
    reached,
    behind: isBehindPace(goal.currentDisplay, goal.targetDisplay, daysElapsedInWeek(now, goal.timeZone)),
  });
  const unit = volumeUnit(goal);
  const nudge = volumeNudge({
    kind: nudgeKind,
    remaining,
    unit,
    percentMode,
    current: goal.currentDisplay,
    target: goal.targetDisplay,
  });
  return {
    id: goal.id,
    title: goal.title,
    kind: goal.kind,
    metric: goal.metric,
    ratio: Math.min(1, Math.max(0, goal.progress.ratio)),
    reached,
    percent,
    centerLabel,
    percentMode,
    nudge,
    accessibilityLabel: goalRowVoiceOver({
      title: goal.title,
      kind: goal.kind,
      current: goal.currentDisplay,
      target: goal.targetDisplay,
      remaining,
      unit,
      percent,
      percentMode,
      nudgeKind,
    }),
  };
}

export function homeComingUp(input: {
  goals: readonly HomeGoalSnapshot[];
  displayed: readonly HomeGoalRowModel[];
  now: Date;
  timeZone: string;
}): HomeComingUp {
  const behind = input.displayed.some((row) => {
    if (row.kind !== "volume" || row.reached) return false;
    const goal = input.goals.find((item) => item.id === row.id);
    if (!goal) return false;
    return isBehindPace(
      goal.currentDisplay,
      goal.targetDisplay,
      daysElapsedInWeek(input.now, goal.timeZone),
    );
  });
  const remainingDays = daysRemainingInWeek(input.now, input.timeZone);
  const weekEndLine = behind && remainingDays >= 1 && remainingDays <= HOME_WEEK_END_MAX_DAYS
    ? homeCopy.daysLeftThisWeek(remainingDays)
    : null;
  const deadline = soonestOneTimeDeadline(input.goals, input.now);
  return { weekEndLine, deadline };
}

export function foldedDeadlineLine(comingUp: HomeComingUp) {
  if (!comingUp.deadline) return { left: comingUp.weekEndLine, right: null as string | null };
  const race = `${comingUp.deadline.title} · ${comingUp.deadline.weekday}`;
  if (comingUp.weekEndLine) return { left: comingUp.weekEndLine, right: race };
  return { left: race, right: null as string | null };
}

export function isBehindPace(done: number, target: number, daysElapsed: number) {
  if (target <= 0 || daysElapsed <= 0) return false;
  return done < (target * daysElapsed) / 7;
}

export function daysElapsedInWeek(now: Date, timeZone: string) {
  return zonedParts(now, timeZone).weekday + 1;
}

export function daysRemainingInWeek(now: Date, timeZone: string) {
  return 6 - zonedParts(now, timeZone).weekday;
}

export function nearestPercent(ratio: number) {
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
}

export function formatRingNumber(value: number) {
  const rounded = roundDisplay(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function ringFillSweepDeg(progress: number, gapDeg: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 360;
  return Math.max(0, clamped * 360 - gapDeg);
}

export function formatRelativeShort(from: Date, now: Date) {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function crewPromptLine(workout: Pick<WorkoutFeedItem, "displayName" | "resultSummary" | "title" | "workoutType" | "occurredAt" | "completedAt">, now: Date) {
  const name = personFirstName(resolveUserDisplayName({ displayName: workout.displayName }));
  const body = crewPromptBody(workout);
  const occurred = workout.occurredAt ?? workout.completedAt;
  const relative = occurred ? formatRelativeShort(new Date(occurred), now) : null;
  return relative ? `${name} logged ${body} · ${relative}` : `${name} logged ${body}`;
}

export function highlightRows(input: {
  firstToRepInToday: { userId: string; displayName: string } | null;
  weekly: readonly { userId: string; displayName: string; count: number }[];
  limit: number;
}) {
  const rows: Array<
    | { kind: "first"; userId: string; displayName: string }
    | { kind: "count"; userId: string; displayName: string; count: number }
  > = [];
  if (input.firstToRepInToday) {
    rows.push({ kind: "first", ...input.firstToRepInToday });
  }
  for (const weekly of input.weekly) {
    rows.push({ kind: "count", ...weekly });
  }
  return rows.slice(0, Math.max(0, input.limit));
}

function crewPromptBody(workout: Pick<WorkoutFeedItem, "resultSummary" | "title" | "workoutType">) {
  const summary = workout.resultSummary?.trim() || null;
  const sport = promptSport[workout.workoutType] ?? "workout";
  if (summary) {
    return summary.toLowerCase().includes(sport) ? summary : `${summary} ${sport}`;
  }
  return workout.title?.trim() || sport;
}

function volumeNudgeKind(input: {
  kind: GoalKind;
  current: number;
  remaining: number;
  reached: boolean;
  behind: boolean;
}): HomeGoalNudgeKind {
  if (input.kind !== "volume") return "none";
  if (input.reached) return "reached";
  if (input.current <= 0) return "first";
  if (input.remaining === 1 || input.remaining === 1.0) return "one_left";
  if (input.behind) return "behind";
  return "remaining";
}

function volumeNudge(input: {
  kind: HomeGoalNudgeKind;
  remaining: number;
  unit: string | null;
  percentMode: boolean;
  current: number;
  target: number;
}) {
  if (input.kind === "none") return null;
  const remainingLabel = remainingWithUnit(input.remaining, input.unit);
  const numberLine = percentNumberLine(input.current, input.target, input.unit, input.remaining);
  if (!input.percentMode) {
    if (input.kind === "first") return homeCopy.firstOne;
    if (input.kind === "reached") return homeCopy.reached;
    if (input.kind === "one_left") return homeCopy.crushing;
    if (input.kind === "behind") return `Don't fall behind, ${remainingLabel} to go`;
    return `${remainingLabel} to go`;
  }
  if (input.kind === "first") return `${zeroOfTarget(input.current, input.target, input.unit)}. ${homeCopy.firstOne}`;
  if (input.kind === "reached") return `${numberLineReached(input.current, input.target, input.unit)}. ${homeCopy.reached}`;
  if (input.kind === "one_left") {
    const unitLabel = input.unit ? ` ${input.unit}` : "";
    return `${homeCopy.crushingLead} ${formatRingNumber(input.current)} of ${formatRingNumber(input.target)}${unitLabel}, 1 left`;
  }
  return numberLine;
}

function percentNumberLine(current: number, target: number, unit: string | null, remaining: number) {
  const unitLabel = unit ? ` ${unit}` : "";
  return `${formatRingNumber(current)} of ${formatRingNumber(target)}${unitLabel}, ${formatRingNumber(remaining)} to go`;
}

function zeroOfTarget(current: number, target: number, unit: string | null) {
  const unitLabel = unit ? ` ${unit}` : "";
  return `${formatRingNumber(current)} of ${formatRingNumber(target)}${unitLabel}`;
}

function numberLineReached(current: number, target: number, unit: string | null) {
  return zeroOfTarget(current, target, unit);
}

function remainingWithUnit(remaining: number, unit: string | null) {
  return unit ? `${formatRingNumber(remaining)} ${unit}` : formatRingNumber(remaining);
}

function volumeUnit(goal: HomeGoalSnapshot) {
  if (goal.kind !== "volume") return null;
  if (goal.metric === "distance") {
    if (goal.displayUnit === "km") return "km";
    if (goal.displayUnit === "m") return "m";
    return "mi";
  }
  if (goal.metric === "minutes") return "min";
  return null;
}

function volumeUnitWord(unit: string | null, metric: GoalMetric) {
  if (metric === "workout_count") return null;
  if (unit === "mi") return "miles";
  if (unit === "km") return "kilometers";
  if (unit === "m") return "meters";
  if (unit === "min") return "minutes";
  return unit;
}

function goalRowVoiceOver(input: {
  title: string;
  kind: GoalKind;
  current: number;
  target: number;
  remaining: number;
  unit: string | null;
  percent: number;
  percentMode: boolean;
  nudgeKind: HomeGoalNudgeKind;
}) {
  if (input.kind !== "volume") {
    return `${input.title}: ${input.percent} percent. No nudge.`;
  }
  const unitWord = volumeUnitWord(input.unit, "distance");
  const doneUnit = unitWord ? ` ${unitWord}` : "";
  const remainingUnit = unitWord ? ` ${unitWord}` : "";
  const ratio = `${formatRingNumber(input.current)} of ${formatRingNumber(input.target)}${doneUnit} done`;
  if (input.nudgeKind === "reached") {
    return `${input.title}: ${ratio}. ${homeCopy.reached}.`;
  }
  if (input.nudgeKind === "first") {
    return `${input.title}: ${ratio}. ${homeCopy.firstOne}.`;
  }
  if (input.nudgeKind === "one_left") {
    return `${input.title}: ${ratio}, 1 left. You're crushing it.`;
  }
  if (input.percentMode) {
    return `${input.title}: ${ratio}, ${formatRingNumber(input.remaining)} to go. ${input.percent} percent.`;
  }
  const remaining = `${formatRingNumber(input.remaining)}${remainingUnit} to go`;
  if (input.nudgeKind === "behind") {
    return `${input.title}: ${ratio}, ${remaining}. Don't fall behind.`;
  }
  return `${input.title}: ${ratio}, ${remaining}.`;
}

function oneTimeDueWithinDays(goal: HomeGoalSnapshot, now: Date, days: number) {
  if (goal.schedule !== "one_time" || !goal.deadlineAt) return false;
  const lastDay = inclusiveCalendarDate(new Date(goal.deadlineAt), goal.timeZone);
  const today = startOfZonedDay(now, goal.timeZone);
  const diff = zonedDayDiff(today, startOfZonedDay(lastDay, goal.timeZone), goal.timeZone);
  return diff >= 0 && diff <= days;
}

function soonestOneTimeDeadline(goals: readonly HomeGoalSnapshot[], now: Date): HomeDeadlineRow | null {
  const due = goals
    .filter((goal) => oneTimeDueWithinDays(goal, now, HOME_DEADLINE_WINDOW_DAYS))
    .map((goal) => {
      const lastDay = inclusiveCalendarDate(new Date(goal.deadlineAt as string), goal.timeZone);
      return {
        goalId: goal.id,
        title: goal.title,
        weekday: WEEKDAYS[zonedParts(lastDay, goal.timeZone).weekday] ?? "Sun",
        lastDay,
      };
    })
    .sort((left, right) => left.lastDay.getTime() - right.lastDay.getTime());
  const first = due[0];
  if (!first) return null;
  return { goalId: first.goalId, title: first.title, weekday: first.weekday };
}

function roundDisplay(value: number) {
  return Math.round(value * 10) / 10;
}

function shiftYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
