import {
  distancePrLaneLabels,
  distanceToMeters,
  extractPrCandidates,
  formatClock,
  formatLoadDisplay,
  kgToLoad,
  loadToKg,
  type PrCandidate,
  type PrLoadUnit,
  type PrSessionSnapshot,
} from "./pr-detection";

export const LATE_LOG_GRACE_DAYS = 7;

export type GoalSessionSegment = {
  segmentType: string;
  distance: number | null;
  distanceUnit: string | null;
  durationSeconds: number | null;
};

export type GoalSessionSnapshot = PrSessionSnapshot & {
  createdAt: Date;
  durationMinutes: number | null;
  segments: GoalSessionSegment[];
};

export type GoalDefinition = {
  kind: "volume" | "time" | "lift";
  metric: "workout_count" | "distance" | "minutes" | "load" | "time";
  sportFilter: string | null;
  targetValue: number;
  displayUnit: string | null;
  prKind: string | null;
  prKey: string | null;
  activationAt: Date;
  timeZone: string;
};

export type GoalPeriodWindow = {
  periodStart: Date;
  periodEnd: Date | null;
  eligibleStart: Date;
  creditClosesAt: Date | null;
};

export function nextActiveSlot(occupied: Array<number | null | undefined>) {
  const used = new Set(
    occupied.filter((slot): slot is number => slot != null && slot >= 1 && slot <= 5),
  );
  for (let slot = 1; slot <= 5; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

export function extractGoalPerformanceCandidates(session: PrSessionSnapshot): PrCandidate[] {
  const completed: PrSessionSnapshot = {
    ...session,
    movements: session.movements.map((movement) => ({
      ...movement,
      sets: movement.sets.filter((set) => set.completed !== false),
    })),
  };
  return extractPrCandidates(completed).filter((candidate) => (
    candidate.kind === "heaviest_single" || candidate.kind === "distance_time"
  ));
}

export function sessionDistanceMeters(session: GoalSessionSnapshot): number | null {
  const total = session.metrics.find((metric) => metric.metricType === "distance");
  if (total?.numericValue != null && total.numericValue > 0) {
    return distanceToMeters(total.numericValue, total.unit);
  }
  let sum = 0;
  let found = false;
  for (const segment of session.segments) {
    if (segment.segmentType !== "work") continue;
    if (segment.distance == null || segment.distance <= 0) continue;
    sum += distanceToMeters(segment.distance, segment.distanceUnit);
    found = true;
  }
  return found ? sum : null;
}

export function sessionRecordedSeconds(session: GoalSessionSnapshot): number | null {
  const durationMetric = session.metrics.find((metric) => metric.metricType === "duration");
  if (durationMetric?.numericValue != null && durationMetric.numericValue > 0) {
    return Math.round(durationMetric.numericValue);
  }
  if (session.workoutFormat === "amrap" || session.workoutFormat === "emom") {
    if (session.formatDurationSeconds != null && session.formatDurationSeconds > 0) {
      return session.formatDurationSeconds;
    }
  }
  if (session.workoutFormat === "for_time") {
    if (session.scoreFinished && session.scoreTimeSeconds != null && session.scoreTimeSeconds > 0) {
      return session.scoreTimeSeconds;
    }
    if (!session.scoreFinished && session.timeCapSeconds != null && session.timeCapSeconds > 0) {
      return session.timeCapSeconds;
    }
  }
  if (session.workoutFormat === "rounds" && session.scoreTimeSeconds != null && session.scoreTimeSeconds > 0) {
    return session.scoreTimeSeconds;
  }
  if (session.durationMinutes != null && session.durationMinutes > 0) {
    return session.durationMinutes * 60;
  }
  let workSeconds = 0;
  let found = false;
  for (const segment of session.segments) {
    if (segment.segmentType !== "work") continue;
    if (segment.durationSeconds == null || segment.durationSeconds <= 0) continue;
    workSeconds += segment.durationSeconds;
    found = true;
  }
  return found ? workSeconds : null;
}

export function sessionMatchesSport(session: { workoutType: string }, sportFilter: string | null) {
  if (!sportFilter) return true;
  return session.workoutType === sportFilter;
}

export function isSessionAdmitted(
  session: { createdAt: Date; occurredAt: Date },
  goal: { activationAt: Date },
  now: Date,
) {
  if (!(session.createdAt.getTime() > goal.activationAt.getTime())) return false;
  if (session.occurredAt.getTime() < goal.activationAt.getTime()) return false;
  if (session.occurredAt.getTime() > now.getTime()) return false;
  return true;
}

export function isSessionInPeriod(
  session: { createdAt: Date; occurredAt: Date },
  period: GoalPeriodWindow,
) {
  if (session.occurredAt.getTime() < period.eligibleStart.getTime()) return false;
  if (period.periodEnd && session.occurredAt.getTime() >= period.periodEnd.getTime()) return false;
  if (period.creditClosesAt && !(session.createdAt.getTime() < period.creditClosesAt.getTime())) {
    return false;
  }
  return true;
}

export function isWorkoutEligibleForGoal(
  session: GoalSessionSnapshot,
  goal: GoalDefinition,
  period: GoalPeriodWindow,
  now: Date,
) {
  if (!sessionMatchesSport(session, goal.sportFilter)) return false;
  if (!isSessionAdmitted(session, goal, now)) return false;
  return isSessionInPeriod(session, period);
}

export function sessionVolumeContribution(
  session: GoalSessionSnapshot,
  metric: GoalDefinition["metric"],
): number | null {
  if (metric === "workout_count") return 1;
  if (metric === "distance") return sessionDistanceMeters(session);
  if (metric === "minutes") return sessionRecordedSeconds(session);
  return null;
}

export function qualifyingTimeCandidate(
  session: GoalSessionSnapshot,
  goal: GoalDefinition,
): PrCandidate | null {
  if (goal.kind !== "time" || !goal.prKey) return null;
  const matches = extractGoalPerformanceCandidates(session).filter((candidate) =>
    candidate.kind === "distance_time"
    && candidate.key === goal.prKey
    && candidate.metric.durationSeconds != null
    && candidate.metric.durationSeconds < goal.targetValue);
  matches.sort((left, right) =>
    (left.metric.durationSeconds ?? Number.POSITIVE_INFINITY)
    - (right.metric.durationSeconds ?? Number.POSITIVE_INFINITY));
  return matches[0] ?? null;
}

export function qualifyingLiftCandidate(
  session: GoalSessionSnapshot,
  goal: GoalDefinition,
): PrCandidate | null {
  if (goal.kind !== "lift" || !goal.prKey) return null;
  const matches = extractGoalPerformanceCandidates(session).filter((candidate) =>
    candidate.kind === "heaviest_single"
    && candidate.key === goal.prKey
    && candidate.metric.loadKg != null
    && candidate.metric.loadKg >= goal.targetValue);
  matches.sort((left, right) => (right.metric.loadKg ?? 0) - (left.metric.loadKg ?? 0));
  return matches[0] ?? null;
}

export function metersToDisplay(meters: number, unit: string | null) {
  if (unit === "km") return meters / 1_000;
  if (unit === "mi") return meters / 1_609.344;
  return meters;
}

export function displayToMeters(value: number, unit: string | null) {
  if (unit === "km") return value * 1_000;
  if (unit === "mi") return value * 1_609.344;
  return value;
}

export function minutesToSeconds(minutes: number) {
  return minutes * 60;
}

export function canonicalTarget(input: {
  kind: GoalDefinition["kind"];
  metric: GoalDefinition["metric"];
  target: number;
  displayUnit: string | null;
}) {
  if (input.kind === "volume" && input.metric === "distance") {
    return displayToMeters(input.target, input.displayUnit);
  }
  if (input.kind === "volume" && input.metric === "minutes") {
    return minutesToSeconds(input.target);
  }
  if (input.kind === "lift") {
    return loadToKg(input.target, input.displayUnit === "kg" ? "kg" : "lb");
  }
  return input.target;
}

export function formatDistanceDisplay(meters: number, unit: string | null) {
  const value = metersToDisplay(meters, unit);
  const rounded = Math.round(value * 10) / 10;
  const label = unit === "km" ? "km" : unit === "m" ? "m" : "mi";
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${label}`;
}

export function formatMinutesDisplay(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function formatCountDisplay(count: number) {
  return `${count} workout${count === 1 ? "" : "s"}`;
}

export function formatLiftDisplay(kg: number, unit: string | null) {
  const loadUnit: PrLoadUnit = unit === "kg" ? "kg" : "lb";
  return formatLoadDisplay(kg, loadUnit);
}

export function formatTimeTarget(totalSeconds: number) {
  return formatClock(totalSeconds);
}

export function laneLabel(lane: string | null) {
  if (!lane) return "";
  return distancePrLaneLabels[lane as keyof typeof distancePrLaneLabels] ?? lane;
}

export function timeGoalTitle(targetSeconds: number, lane: string | null) {
  const clock = formatClock(targetSeconds);
  const compact = clock.endsWith(":00") ? clock.slice(0, -3) : clock;
  return `Sub-${compact} ${laneLabel(lane)}`.trim();
}

export function liftGoalTitle(movementName: string, kg: number, unit: string | null) {
  return `${movementName} ${kgToLoad(kg, unit === "kg" ? "kg" : "lb")} ${unit === "kg" ? "kg" : "lb"}`;
}

export function volumeGoalTitle(input: {
  metric: GoalDefinition["metric"];
  target: number;
  displayUnit: string | null;
  schedule: "one_time" | "weekly" | "monthly";
}) {
  const period = input.schedule === "weekly"
    ? " this week"
    : input.schedule === "monthly"
      ? " this month"
      : "";
  if (input.metric === "workout_count") {
    return `${input.target} workout${input.target === 1 ? "" : "s"}${period}`;
  }
  if (input.metric === "minutes") {
    return `${input.target} minute${input.target === 1 ? "" : "s"}${period}`;
  }
  const unit = input.displayUnit === "km" ? "km" : input.displayUnit === "m" ? "m" : "miles";
  return `${input.target} ${unit}${period}`;
}
