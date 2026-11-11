import type { WorkoutPeriodStats } from "@repin/types";
import { isDashboardDistanceSport } from "@repin/validation";

import {
  sessionDistanceMeters,
  sessionRecordedSeconds,
  type GoalSessionSnapshot,
} from "./goal-credit";

export class DashboardRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DashboardRequestError";
    this.statusCode = statusCode;
  }
}

export type DashboardSessionContribution = {
  recordedSeconds: number | null;
  distanceMeters: number | null;
  distanceUnit: string | null;
};

export function dashboardSessionContribution(session: GoalSessionSnapshot): DashboardSessionContribution {
  const recordedSeconds = sessionRecordedSeconds(session);
  if (!isDashboardDistanceSport(session.workoutType)) {
    return { recordedSeconds, distanceMeters: null, distanceUnit: null };
  }
  const total = session.metrics.find((metric) => metric.metricType === "distance");
  const distanceMeters = sessionDistanceMeters(session);
  let distanceUnit: string | null = null;
  if (total?.numericValue != null && total.numericValue > 0) {
    distanceUnit = total.unit;
  } else {
    for (const segment of session.segments) {
      if (segment.segmentType !== "work") continue;
      if (segment.distance == null || segment.distance <= 0) continue;
      distanceUnit = segment.distanceUnit;
      break;
    }
  }
  if (distanceMeters == null) {
    return { recordedSeconds, distanceMeters: null, distanceUnit };
  }
  return { recordedSeconds, distanceMeters, distanceUnit };
}

export function aggregatePeriodStats(input: {
  period: "week" | "month";
  start: Date;
  end: Date;
  rangeLabel: string;
  contributions: DashboardSessionContribution[];
}): WorkoutPeriodStats {
  let recordedSeconds = 0;
  let hasTime = false;
  let missingDurationCount = 0;
  let recordedMeters = 0;
  let hasDistance = false;
  let distanceWorkoutCount = 0;
  let distanceWithValueCount = 0;
  const loggedDistanceUnits: string[] = [];

  for (const contribution of input.contributions) {
    if (contribution.recordedSeconds != null && contribution.recordedSeconds > 0) {
      recordedSeconds += contribution.recordedSeconds;
      hasTime = true;
    } else {
      missingDurationCount += 1;
    }
    if (contribution.distanceMeters != null) {
      distanceWorkoutCount += 1;
      if (contribution.distanceMeters > 0) {
        recordedMeters += contribution.distanceMeters;
        hasDistance = true;
        distanceWithValueCount += 1;
        if (contribution.distanceUnit && !loggedDistanceUnits.includes(contribution.distanceUnit)) {
          loggedDistanceUnits.push(contribution.distanceUnit);
        }
      }
    } else if (contribution.distanceUnit != null) {
      distanceWorkoutCount += 1;
    }
  }

  return {
    period: input.period,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    rangeLabel: input.rangeLabel,
    workoutCount: input.contributions.length,
    recordedSeconds: hasTime ? recordedSeconds : null,
    recordedMeters: hasDistance ? recordedMeters : null,
    missingDurationCount,
    distanceWorkoutCount,
    distanceWithValueCount,
    loggedDistanceUnits,
  };
}
