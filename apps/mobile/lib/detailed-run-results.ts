import type {
  RunWorkoutSubtype,
  WorkoutDistanceUnit,
  WorkoutSessionSegmentInput,
} from "@repin/types";

import type { QuickLogResultsDraft } from "../ui/quick-log-results";
import { formatDurationSeconds } from "./workout-detail-format";
import { getDurationSeconds, validateTimeParts } from "./workout-time";

export interface IntervalDraft {
  id: number;
  distance: string;
  distanceUnit: WorkoutDistanceUnit;
  timeMinutes: string;
  timeSeconds: string;
  recoverySeconds: string;
  quantity: number;
}

let nextIntervalId = 1;

export function createEmptyInterval(): IntervalDraft {
  return {
    id: nextIntervalId++,
    distance: "",
    distanceUnit: "m",
    timeMinutes: "",
    timeSeconds: "",
    recoverySeconds: "",
    quantity: 1,
  };
}

export function validateIntervals(intervals: IntervalDraft[]) {
  const meaningful = intervals.filter(isMeaningfulInterval);
  if (!meaningful.length) return "Add results for at least one interval.";

  for (const [index, interval] of intervals.entries()) {
    if (!isMeaningfulInterval(interval)) continue;
    if (!Number.isSafeInteger(interval.quantity) || interval.quantity < 1) {
      return `Interval ${index + 1} repeats must be a positive whole number.`;
    }
    if (interval.distance.trim()) {
      const distance = Number(interval.distance);
      if (!Number.isFinite(distance) || distance <= 0) return `Interval ${index + 1} distance must be greater than zero.`;
    }
    const timeIssue = validateTimeParts(interval.timeMinutes, interval.timeSeconds);
    if (timeIssue) return `Interval ${index + 1}: ${timeIssue}`;
    if (interval.recoverySeconds.trim()) {
      const recoverySeconds = Number(interval.recoverySeconds);
      if (!/^\d+$/.test(interval.recoverySeconds.trim()) || !Number.isSafeInteger(recoverySeconds) || recoverySeconds <= 0) {
        return `Interval ${index + 1} recovery must be a positive whole number of seconds.`;
      }
    }
  }
  if (getExpandedSegmentCount(meaningful) > 500) return "Intervals cannot exceed 500 total repeats.";
  return null;
}

export function buildIntervalSegments(intervals: IntervalDraft[]): WorkoutSessionSegmentInput[] {
  let position = 0;
  return intervals.filter(isMeaningfulInterval).flatMap((interval) => (
    Array.from({ length: interval.quantity }, () => ({
      position: position++,
      segmentType: "work" as const,
      distance: interval.distance.trim() ? Number(interval.distance) : null,
      distanceUnit: interval.distance.trim() ? interval.distanceUnit : null,
      durationSeconds: getDurationSeconds(interval.timeMinutes, interval.timeSeconds),
      recoverySeconds: interval.recoverySeconds.trim() ? Number(interval.recoverySeconds) : null,
    }))
  ));
}

export function buildRunResultSummary(
  subtype: RunWorkoutSubtype,
  results: QuickLogResultsDraft,
  intervals: IntervalDraft[],
) {
  if (subtype === "interval") {
    return intervals.filter(isMeaningfulInterval).map((interval) => {
      const parts: string[] = [];
      if (interval.distance.trim()) parts.push(`${formatNumber(Number(interval.distance))} ${interval.distanceUnit}`);
      const duration = getDurationSeconds(interval.timeMinutes, interval.timeSeconds);
      if (duration != null) parts.push(formatDurationSeconds(duration));
      if (interval.recoverySeconds.trim()) parts.push(`${formatRecovery(Number(interval.recoverySeconds))} recovery`);
      const result = parts.join(" · ") || "Interval results";
      return interval.quantity > 1 ? `${interval.quantity} × ${result}` : result;
    });
  }

  const parts: string[] = [];
  if (results.distance.trim()) parts.push(`${formatNumber(Number(results.distance))} ${results.distanceUnit}`);
  const duration = getDurationSeconds(results.timeMinutes, results.timeSeconds);
  if (duration != null) parts.push(formatDurationSeconds(duration));
  const summary = parts.join(" · ") || "No results added";
  return [subtype === "tempo" && parts.length ? `Tempo · ${summary}` : summary];
}

export function getExpandedSegmentCount(intervals: IntervalDraft[]) {
  return intervals.filter(isMeaningfulInterval).reduce((total, interval) => total + interval.quantity, 0);
}

function isMeaningfulInterval(interval: IntervalDraft) {
  return Boolean(
    interval.distance.trim()
    || interval.timeMinutes.trim()
    || interval.timeSeconds.trim()
    || interval.recoverySeconds.trim(),
  );
}

function formatRecovery(seconds: number) {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: false }).format(value);
}
