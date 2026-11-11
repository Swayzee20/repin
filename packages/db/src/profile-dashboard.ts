import "server-only";

import type {
  CurrentBest,
  CurrentBestsResponse,
  PersonalRecordKind,
  PersonalWorkoutDetail,
  PersonalWorkoutListItem,
  PersonalWorkoutPage,
  WorkoutFormat,
  WorkoutFormatColumns,
  WorkoutStatsResponse,
} from "@repin/types";
import {
  columnsToFormat,
  dashboardHistoryDefaultLimit,
  dashboardPeriodBounds,
  decodeWorkoutCursor,
  encodeWorkoutCursor,
  formatMonthRangeLabel,
  formatWeekRangeLabel,
  inclusiveDateRangeBounds,
  profileDashboardCopy,
  timeZoneDisplayName,
  type DashboardDistanceUnit,
} from "@repin/validation";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { getDatabase } from "./connection";
import {
  type GoalSessionSegment,
  type GoalSessionSnapshot,
} from "./goal-credit";
import {
  aggregatePeriodStats,
  DashboardRequestError,
  dashboardSessionContribution,
  type DashboardSessionContribution,
} from "./profile-dashboard-stats";
import * as schema from "./schema";
import { derivedDisplayMetrics } from "./workout-format-display";
import { formatWorkoutResultSummary } from "./workout-result-summary";

const occurredAtPreciseSql = sql<string>`to_char(${schema.workoutSessions.occurredAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

type SessionRow = {
  id: string;
  userId: string;
  workoutType: string;
  workoutSubtype: string | null;
  workoutFormat: string | null;
  formatDurationSeconds: number | null;
  formatIntervalSeconds: number | null;
  formatRounds: number | null;
  timeCapSeconds: number | null;
  scoreFinished: boolean | null;
  scoreTimeSeconds: number | null;
  scoreRounds: number | null;
  scoreReps: number | null;
  name: string | null;
  durationMinutes: number | null;
  effort: number | null;
  occurredAt: Date;
  occurredAtPrecise?: string;
};

type MetricRow = {
  id: string;
  workoutSessionId: string;
  position: number;
  metricType: string;
  label: string | null;
  numericValue: number | null;
  textValue: string | null;
  unit: string | null;
};

type SegmentRow = {
  id: string;
  workoutSessionId: string;
  position: number;
  segmentType: string;
  distance: number | null;
  distanceUnit: string | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  notes: string | null;
  configuration: Record<string, unknown> | null;
};

type MovementSetRow = {
  movementResultId: string;
  workoutSessionId: string;
  movementId: string | null;
  movementName: string;
  movementPosition: number;
  movementNotes: string | null;
  setId: string | null;
  setPosition: number | null;
  reps: number | null;
  load: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distance: number | null;
  distanceUnit: string | null;
  calories: number | null;
  completed: boolean | null;
  setNotes: string | null;
};

export {
  aggregatePeriodStats,
  dashboardSessionContribution,
  type DashboardSessionContribution,
} from "./profile-dashboard-stats";

function toGoalSnapshot(
  session: SessionRow,
  metrics: Array<{ metricType: string; numericValue: number | null; unit: string | null }>,
  segments: GoalSessionSegment[],
): GoalSessionSnapshot {
  return {
    id: session.id,
    userId: session.userId,
    createdAt: session.occurredAt,
    occurredAt: session.occurredAt,
    workoutType: session.workoutType,
    workoutFormat: session.workoutFormat,
    formatDurationSeconds: session.formatDurationSeconds,
    timeCapSeconds: session.timeCapSeconds,
    scoreFinished: session.scoreFinished,
    scoreTimeSeconds: session.scoreTimeSeconds,
    scoreRounds: session.scoreRounds,
    scoreReps: session.scoreReps,
    durationMinutes: session.durationMinutes,
    metrics: metrics.map((metric) => ({
      metricType: metric.metricType,
      numericValue: metric.numericValue,
      unit: metric.unit,
    })),
    movements: [],
    segments,
  };
}

function workoutTitle(session: { name: string | null; workoutType: string }) {
  return session.name?.trim() || session.workoutType;
}

function hasDetailedResults(input: {
  format: string | null;
  metrics: unknown[];
  movements: unknown[];
  segments: unknown[];
}) {
  return Boolean(input.format)
    || input.metrics.length > 0
    || input.movements.length > 0
    || input.segments.length > 0;
}

function occurredAtIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listOwnedWorkouts(input: {
  userId: string;
  timeZone: string;
  cursor?: string;
  limit?: number;
  sport?: string;
  from?: string;
  to?: string;
  now?: Date;
}): Promise<PersonalWorkoutPage> {
  const now = input.now ?? new Date();
  const limit = Math.min(
    Math.max(input.limit ?? dashboardHistoryDefaultLimit, 1),
    50,
  );
  let cursor: { occurredAtPrecise: string; id: string } | undefined;
  if (input.cursor) {
    const decoded = decodeWorkoutCursor(input.cursor);
    if (!decoded) {
      throw new DashboardRequestError("Workout list cursor is invalid");
    }
    cursor = decoded;
  }

  let rangeStart: Date | undefined;
  let rangeEnd: Date | undefined;
  if (input.from && input.to) {
    const bounds = inclusiveDateRangeBounds(input.from, input.to, input.timeZone);
    if (!bounds) {
      throw new DashboardRequestError("Workout date range is invalid");
    }
    rangeStart = bounds.start;
    rangeEnd = bounds.end;
  }

  const database = getDatabase();
  const filters = [
    eq(schema.workoutSessions.userId, input.userId),
    lt(schema.workoutSessions.occurredAt, now),
  ];
  if (input.sport) filters.push(eq(schema.workoutSessions.workoutType, input.sport));
  if (rangeStart) filters.push(sql`${schema.workoutSessions.occurredAt} >= ${rangeStart}`);
  if (rangeEnd) filters.push(sql`${schema.workoutSessions.occurredAt} < ${rangeEnd}`);
  if (cursor) {
    filters.push(sql`(${schema.workoutSessions.occurredAt}, ${schema.workoutSessions.id}) < (${cursor.occurredAtPrecise}::timestamptz, ${cursor.id}::uuid)`);
  }

  const rows = await database
    .select({
      id: schema.workoutSessions.id,
      userId: schema.workoutSessions.userId,
      workoutType: schema.workoutSessions.workoutType,
      workoutSubtype: schema.workoutSessions.workoutSubtype,
      workoutFormat: schema.workoutSessions.workoutFormat,
      formatDurationSeconds: schema.workoutSessions.formatDurationSeconds,
      formatIntervalSeconds: schema.workoutSessions.formatIntervalSeconds,
      formatRounds: schema.workoutSessions.formatRounds,
      timeCapSeconds: schema.workoutSessions.timeCapSeconds,
      scoreFinished: schema.workoutSessions.scoreFinished,
      scoreTimeSeconds: schema.workoutSessions.scoreTimeSeconds,
      scoreRounds: schema.workoutSessions.scoreRounds,
      scoreReps: schema.workoutSessions.scoreReps,
      name: schema.workoutSessions.name,
      durationMinutes: schema.workoutSessions.durationMinutes,
      effort: schema.workoutSessions.effort,
      occurredAt: schema.workoutSessions.occurredAt,
      occurredAtPrecise: occurredAtPreciseSql,
    })
    .from(schema.workoutSessions)
    .where(and(...filters))
    .orderBy(desc(schema.workoutSessions.occurredAt), desc(schema.workoutSessions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const next = rows.length > limit ? rows[limit - 1] : null;
  const sessionIds = page.map((row) => row.id);
  const { metricsBySession, segmentsBySession, movementsBySession } = await loadSessionChildren(
    sessionIds,
    { sets: true, notes: false },
  );

  const workouts: PersonalWorkoutListItem[] = page.map((session) => {
    const metrics = metricsBySession.get(session.id) ?? [];
    const segments = segmentsBySession.get(session.id) ?? [];
    const movements = movementsBySession.get(session.id) ?? [];
    const formatColumns = formatColumnsOf(session);
    return {
      id: session.id,
      workoutType: session.workoutType,
      title: workoutTitle(session),
      name: session.name,
      occurredAt: occurredAtIso(session.occurredAt),
      durationMinutes: session.durationMinutes,
      effort: session.effort,
      resultSummary: formatWorkoutResultSummary({
        workoutType: session.workoutType,
        workoutSubtype: session.workoutSubtype,
        ...formatColumns,
        metrics,
        movements: movements.map((movement) => ({
          movementName: movement.movementName,
          sets: movement.sets.map((set) => ({
            reps: set.reps,
            load: set.load,
            loadUnit: set.loadUnit,
          })),
        })),
        segments: asIntervalSegments(segments),
      }) ?? (hasDetailedResults({
        format: session.workoutFormat,
        metrics,
        movements,
        segments,
      }) ? null : profileDashboardCopy.quickLogTitle),
      hasDetailedResults: hasDetailedResults({
        format: session.workoutFormat,
        metrics,
        movements,
        segments,
      }),
    };
  });

  return {
    workouts,
    nextCursor: next
      ? encodeWorkoutCursor(next.occurredAtPrecise ?? next.occurredAt.toISOString(), next.id)
      : null,
  };
}

export async function getOwnedWorkoutDetail(input: {
  userId: string;
  sessionId: string;
}): Promise<PersonalWorkoutDetail | null> {
  const database = getDatabase();
  const [session] = await database
    .select()
    .from(schema.workoutSessions)
    .where(and(
      eq(schema.workoutSessions.id, input.sessionId),
      eq(schema.workoutSessions.userId, input.userId),
    ))
    .limit(1);

  if (!session) return null;

  const { metricsBySession, segmentsBySession, movementsBySession } = await loadSessionChildren(
    [session.id],
    { sets: true, notes: true },
  );
  const metrics = metricsBySession.get(session.id) ?? [];
  const segments = segmentsBySession.get(session.id) ?? [];
  const movements = movementsBySession.get(session.id) ?? [];
  const formatColumns = formatColumnsOf(session);
  const format = columnsToFormat(formatColumns);
  const snapshot = toGoalSnapshot(session, metrics, segments);
  const contribution = dashboardSessionContribution(snapshot);
  const [prRows, goalRows] = await Promise.all([
    database
      .select({
        id: schema.personalRecords.id,
        kind: schema.personalRecords.kind,
        key: schema.personalRecords.key,
        displayLabel: schema.personalRecords.displayLabel,
        displayValue: schema.personalRecords.displayValue,
        baselineOnly: schema.personalRecords.baselineOnly,
        sourceSetId: schema.personalRecords.sourceSetId,
      })
      .from(schema.personalRecords)
      .where(and(
        eq(schema.personalRecords.userId, input.userId),
        eq(schema.personalRecords.sourceSessionId, session.id),
      )),
    database
      .select({
        id: schema.goalPeriods.id,
        goalId: schema.goals.id,
      })
      .from(schema.goalPeriods)
      .innerJoin(schema.goals, eq(schema.goalPeriods.goalId, schema.goals.id))
      .where(and(
        eq(schema.goals.userId, input.userId),
        eq(schema.goalPeriods.sourceSessionId, session.id),
      )),
  ]);

  const celebrated = prRows.filter((row) => !row.baselineOnly);
  const baselines = prRows.filter((row) => row.baselineOnly);

  return {
    id: session.id,
    workoutType: session.workoutType,
    workoutSubtype: session.workoutSubtype,
    title: workoutTitle(session),
    name: session.name,
    occurredAt: occurredAtIso(session.occurredAt),
    durationMinutes: session.durationMinutes,
    effort: session.effort,
    format,
    metrics: format ? derivedDisplayMetrics(format, session.id) : metrics.map((metric) => ({
      id: metric.id,
      position: metric.position,
      metricType: metric.metricType as PersonalWorkoutDetail["metrics"][number]["metricType"],
      label: metric.label,
      numericValue: metric.numericValue,
      textValue: metric.textValue,
      unit: metric.unit,
    })),
    movements: movements.map((movement) => ({
      id: movement.id,
      movementId: movement.movementId,
      movementName: movement.movementName,
      position: movement.position,
      notes: movement.notes,
      sets: movement.sets,
    })),
    segments: segments.map((segment) => ({
      id: segment.id,
      position: segment.position,
      segmentType: segment.segmentType as PersonalWorkoutDetail["segments"][number]["segmentType"],
      distance: segment.distance,
      distanceUnit: segment.distanceUnit as PersonalWorkoutDetail["segments"][number]["distanceUnit"],
      durationSeconds: segment.durationSeconds,
      recoverySeconds: segment.recoverySeconds,
      notes: segment.notes,
      configuration: segment.configuration,
    })),
    resultSummary: formatWorkoutResultSummary({
      workoutType: session.workoutType,
      workoutSubtype: session.workoutSubtype,
      ...formatColumns,
      metrics,
      movements: movements.map((movement) => ({
        movementName: movement.movementName,
        sets: movement.sets,
      })),
      segments: asIntervalSegments(segments),
    }),
    hasDetailedResults: hasDetailedResults({
      format: session.workoutFormat,
      metrics,
      movements,
      segments,
    }),
    recordedSeconds: contribution.recordedSeconds,
    prBadges: celebrated.map((row) => ({
      id: row.id,
      kind: row.kind as PersonalRecordKind,
      key: row.key,
      label: row.displayLabel,
      value: row.displayValue,
    })),
    goalBadges: goalRows.map((row) => ({
      id: row.goalId,
      periodId: row.id,
      label: "Goal",
      value: "Goal",
    })),
    currentBestSetIds: celebrated
      .map((row) => row.sourceSetId)
      .filter((id): id is string => Boolean(id)),
    startingBestSetIds: baselines
      .map((row) => row.sourceSetId)
      .filter((id): id is string => Boolean(id)),
    baselineOnly: baselines.length > 0,
  };
}

export async function getOwnedWorkoutStats(input: {
  userId: string;
  timeZone: string;
  distanceUnit?: DashboardDistanceUnit;
  now?: Date;
}): Promise<WorkoutStatsResponse> {
  const now = input.now ?? new Date();
  const bounds = dashboardPeriodBounds(now, input.timeZone);
  const database = getDatabase();
  const sessions = await database
    .select({
      id: schema.workoutSessions.id,
      userId: schema.workoutSessions.userId,
      workoutType: schema.workoutSessions.workoutType,
      workoutSubtype: schema.workoutSessions.workoutSubtype,
      workoutFormat: schema.workoutSessions.workoutFormat,
      formatDurationSeconds: schema.workoutSessions.formatDurationSeconds,
      formatIntervalSeconds: schema.workoutSessions.formatIntervalSeconds,
      formatRounds: schema.workoutSessions.formatRounds,
      timeCapSeconds: schema.workoutSessions.timeCapSeconds,
      scoreFinished: schema.workoutSessions.scoreFinished,
      scoreTimeSeconds: schema.workoutSessions.scoreTimeSeconds,
      scoreRounds: schema.workoutSessions.scoreRounds,
      scoreReps: schema.workoutSessions.scoreReps,
      name: schema.workoutSessions.name,
      durationMinutes: schema.workoutSessions.durationMinutes,
      effort: schema.workoutSessions.effort,
      occurredAt: schema.workoutSessions.occurredAt,
    })
    .from(schema.workoutSessions)
    .where(and(
      eq(schema.workoutSessions.userId, input.userId),
      sql`${schema.workoutSessions.occurredAt} >= ${bounds.weekStart < bounds.monthStart ? bounds.weekStart : bounds.monthStart}`,
      sql`${schema.workoutSessions.occurredAt} < ${bounds.weekEnd > bounds.monthEnd ? bounds.weekEnd : bounds.monthEnd}`,
      lt(schema.workoutSessions.occurredAt, now),
    ));

  const sessionIds = sessions.map((session) => session.id);
  const { metricsBySession, segmentsBySession } = await loadSessionChildren(sessionIds, {
    sets: false,
    notes: false,
  });

  const weekContributions: DashboardSessionContribution[] = [];
  const monthContributions: DashboardSessionContribution[] = [];
  for (const session of sessions) {
    const metrics = metricsBySession.get(session.id) ?? [];
    const segments = segmentsBySession.get(session.id) ?? [];
    const contribution = dashboardSessionContribution(toGoalSnapshot(session, metrics, segments));
    if (session.occurredAt >= bounds.weekStart && session.occurredAt < bounds.weekEnd) {
      weekContributions.push(contribution);
    }
    if (session.occurredAt >= bounds.monthStart && session.occurredAt < bounds.monthEnd) {
      monthContributions.push(contribution);
    }
  }

  return {
    timeZone: input.timeZone,
    timeZoneLabel: timeZoneDisplayName(input.timeZone, now),
    week: aggregatePeriodStats({
      period: "week",
      start: bounds.weekStart,
      end: bounds.weekEnd,
      rangeLabel: formatWeekRangeLabel(bounds.weekStart, bounds.weekEnd, input.timeZone),
      contributions: weekContributions,
    }),
    month: aggregatePeriodStats({
      period: "month",
      start: bounds.monthStart,
      end: bounds.monthEnd,
      rangeLabel: formatMonthRangeLabel(bounds.monthStart, bounds.monthEnd, input.timeZone),
      contributions: monthContributions,
    }),
  };
}

export async function listOwnedPersonalRecords(input: {
  userId: string;
  kind?: PersonalRecordKind;
}): Promise<CurrentBestsResponse> {
  const database = getDatabase();
  const filters = [eq(schema.personalRecords.userId, input.userId)];
  if (input.kind) filters.push(eq(schema.personalRecords.kind, input.kind));

  const rows = await database
    .select({
      id: schema.personalRecords.id,
      kind: schema.personalRecords.kind,
      key: schema.personalRecords.key,
      displayLabel: schema.personalRecords.displayLabel,
      displayValue: schema.personalRecords.displayValue,
      baselineOnly: schema.personalRecords.baselineOnly,
      celebrated: schema.personalRecords.celebrated,
      sourceSessionId: schema.personalRecords.sourceSessionId,
      sourceSetId: schema.personalRecords.sourceSetId,
      sourceOccurredAt: schema.workoutSessions.occurredAt,
    })
    .from(schema.personalRecords)
    .leftJoin(
      schema.workoutSessions,
      and(
        eq(schema.workoutSessions.id, schema.personalRecords.sourceSessionId),
        eq(schema.workoutSessions.userId, input.userId),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(schema.personalRecords.kind), asc(schema.personalRecords.displayLabel));

  const bests: CurrentBest[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as PersonalRecordKind,
    key: row.key,
    label: row.displayLabel,
    value: row.displayValue,
    baselineOnly: row.baselineOnly,
    celebrated: row.celebrated,
    sourceSessionId: row.sourceSessionId,
    sourceSetId: row.sourceSetId,
    sourceOccurredAt: row.sourceOccurredAt ? occurredAtIso(row.sourceOccurredAt) : null,
    sourceAvailable: Boolean(row.sourceSessionId && row.sourceOccurredAt),
  }));

  return { bests };
}

function asIntervalSegments(segments: SegmentRow[]) {
  return segments.map((segment) => ({
    segmentType: segment.segmentType === "recovery" ? "recovery" as const : "work" as const,
    distance: segment.distance,
    distanceUnit: segment.distanceUnit as "m" | "km" | "mi" | null,
    durationSeconds: segment.durationSeconds,
    recoverySeconds: segment.recoverySeconds,
  }));
}

function formatColumnsOf(session: SessionRow): WorkoutFormatColumns {
  return {
    workoutFormat: session.workoutFormat as WorkoutFormat | null,
    formatDurationSeconds: session.formatDurationSeconds,
    formatIntervalSeconds: session.formatIntervalSeconds,
    formatRounds: session.formatRounds,
    timeCapSeconds: session.timeCapSeconds,
    scoreFinished: session.scoreFinished,
    scoreTimeSeconds: session.scoreTimeSeconds,
    scoreRounds: session.scoreRounds,
    scoreReps: session.scoreReps,
  };
}

async function loadSessionChildren(
  sessionIds: string[],
  options: { sets: boolean; notes: boolean },
) {
  const metricsBySession = new Map<string, MetricRow[]>();
  const segmentsBySession = new Map<string, SegmentRow[]>();
  const movementsBySession = new Map<string, Array<{
    id: string;
    movementId: string | null;
    movementName: string;
    position: number;
    notes: string | null;
    sets: Array<{
      id: string;
      position: number;
      reps: number | null;
      load: number | null;
      loadUnit: string | null;
      durationSeconds: number | null;
      distance: number | null;
      distanceUnit: string | null;
      calories: number | null;
      completed: boolean;
      notes: string | null;
    }>;
  }>>();

  if (!sessionIds.length) {
    return { metricsBySession, segmentsBySession, movementsBySession };
  }

  const database = getDatabase();
  const [metricRows, segmentRows, movementRows] = await Promise.all([
    database
      .select({
        id: schema.workoutSessionMetrics.id,
        workoutSessionId: schema.workoutSessionMetrics.workoutSessionId,
        position: schema.workoutSessionMetrics.position,
        metricType: schema.workoutSessionMetrics.metricType,
        label: schema.workoutSessionMetrics.label,
        numericValue: schema.workoutSessionMetrics.numericValue,
        textValue: schema.workoutSessionMetrics.textValue,
        unit: schema.workoutSessionMetrics.unit,
      })
      .from(schema.workoutSessionMetrics)
      .where(inArray(schema.workoutSessionMetrics.workoutSessionId, sessionIds))
      .orderBy(asc(schema.workoutSessionMetrics.position)),
    database
      .select({
        id: schema.workoutSessionSegments.id,
        workoutSessionId: schema.workoutSessionSegments.workoutSessionId,
        position: schema.workoutSessionSegments.position,
        segmentType: schema.workoutSessionSegments.segmentType,
        distance: schema.workoutSessionSegments.distance,
        distanceUnit: schema.workoutSessionSegments.distanceUnit,
        durationSeconds: schema.workoutSessionSegments.durationSeconds,
        recoverySeconds: schema.workoutSessionSegments.recoverySeconds,
        notes: schema.workoutSessionSegments.notes,
        configuration: schema.workoutSessionSegments.configuration,
      })
      .from(schema.workoutSessionSegments)
      .where(inArray(schema.workoutSessionSegments.workoutSessionId, sessionIds))
      .orderBy(asc(schema.workoutSessionSegments.position)),
    database
      .select({
        movementResultId: schema.sessionMovementResults.id,
        workoutSessionId: schema.sessionMovementResults.workoutSessionId,
        movementId: schema.sessionMovementResults.movementId,
        movementName: schema.sessionMovementResults.movementName,
        movementPosition: schema.sessionMovementResults.position,
        movementNotes: schema.sessionMovementResults.notes,
        setId: schema.setResults.id,
        setPosition: schema.setResults.position,
        reps: schema.setResults.reps,
        load: schema.setResults.load,
        loadUnit: schema.setResults.loadUnit,
        durationSeconds: schema.setResults.durationSeconds,
        distance: schema.setResults.distance,
        distanceUnit: schema.setResults.distanceUnit,
        calories: schema.setResults.calories,
        completed: schema.setResults.completed,
        setNotes: schema.setResults.notes,
      })
      .from(schema.sessionMovementResults)
      .leftJoin(
        schema.setResults,
        eq(schema.setResults.sessionMovementResultId, schema.sessionMovementResults.id),
      )
      .where(inArray(schema.sessionMovementResults.workoutSessionId, sessionIds))
      .orderBy(
        asc(schema.sessionMovementResults.position),
        asc(schema.setResults.position),
      ),
  ]);

  for (const row of metricRows) {
    const list = metricsBySession.get(row.workoutSessionId) ?? [];
    list.push(row);
    metricsBySession.set(row.workoutSessionId, list);
  }
  for (const row of segmentRows) {
    const list = segmentsBySession.get(row.workoutSessionId) ?? [];
    list.push({
      ...row,
      notes: options.notes ? row.notes : null,
      configuration: row.configuration,
    });
    segmentsBySession.set(row.workoutSessionId, list);
  }
  for (const row of movementRows as MovementSetRow[]) {
    let sessionMovements = movementsBySession.get(row.workoutSessionId);
    if (!sessionMovements) {
      sessionMovements = [];
      movementsBySession.set(row.workoutSessionId, sessionMovements);
    }
    let movement = sessionMovements.find((item) => item.id === row.movementResultId);
    if (!movement) {
      movement = {
        id: row.movementResultId,
        movementId: row.movementId,
        movementName: row.movementName,
        position: row.movementPosition,
        notes: options.notes ? row.movementNotes : null,
        sets: [],
      };
      sessionMovements.push(movement);
    }
    if (options.sets && row.setId && row.setPosition != null && row.completed != null) {
      movement.sets.push({
        id: row.setId,
        position: row.setPosition,
        reps: row.reps,
        load: row.load,
        loadUnit: row.loadUnit,
        durationSeconds: row.durationSeconds,
        distance: row.distance,
        distanceUnit: row.distanceUnit,
        calories: row.calories,
        completed: Boolean(row.completed),
        notes: options.notes ? row.setNotes : null,
      });
    }
  }

  return { metricsBySession, segmentsBySession, movementsBySession };
}
