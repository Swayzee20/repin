import "server-only";

import { randomUUID } from "node:crypto";

import type {
  GoalBadge,
  GoalDetail,
  GoalDetectionResult,
  GoalKind,
  GoalMetric,
  GoalProgress,
  GoalReached,
  GoalSchedule,
  GoalState,
  GoalSummary,
  GoalsListResponse,
  WorkoutType,
} from "@repin/types";
import { MAX_ACTIVE_GOALS } from "@repin/types";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import {
  creditClosesAt,
  currentCalendarPeriod,
  exclusiveDeadlineAtEndOfLocalDay,
  formatDueDate,
  formatShortRange,
  isValidTimeZone,
  startOfZonedDay,
  zonedParts,
} from "./goal-calendar";
import {
  canonicalTarget,
  extractGoalPerformanceCandidates,
  formatCountDisplay,
  formatDistanceDisplay,
  formatLiftDisplay,
  formatMinutesDisplay,
  formatTimeTarget,
  liftGoalTitle,
  nextActiveSlot,
  qualifyingLiftCandidate,
  qualifyingTimeCandidate,
  sessionVolumeContribution,
  timeGoalTitle,
  volumeGoalTitle,
  type GoalDefinition,
  type GoalPeriodWindow,
  type GoalSessionSnapshot,
} from "./goal-credit";
import { formatClock, movementIdentity } from "./pr-detection";
import * as schema from "./schema";

type Queryable = Database | DatabaseTransaction;

export class GoalRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GoalRequestError";
    this.statusCode = statusCode;
  }
}

export const GOAL_CAP_MESSAGE =
  "You have 5 active goals. Archive one, or wait for a one-time goal to finish, before adding another.";

export const GOAL_HAND_MARK_SHARE_MESSAGE = "Hand-marked goals stay private, with no badge.";
export const GOAL_TIMEZONE_MESSAGE = "Choose a valid time zone";
export const GOAL_REOPEN_CAP_MESSAGE =
  "You already have 5 active goals. Archive one first, then you can reopen this.";

type GoalRow = typeof schema.goals.$inferSelect;
type PeriodRow = typeof schema.goalPeriods.$inferSelect;

export type CreateGoalInput = {
  userId: string;
  kind: GoalKind;
  metric: GoalMetric;
  sportFilter: WorkoutType | null;
  target: number;
  displayUnit: string | null;
  schedule: GoalSchedule;
  deadlineAt: Date | null;
  timeZone: string;
  movementId: string | null;
  movementName: string | null;
  lane: string | null;
  now?: Date;
};

export async function listGoalsForUser(userId: string, now = new Date()): Promise<GoalsListResponse> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.userId, userId))
    .orderBy(asc(schema.goals.createdAt));
  const periods = rows.length
    ? await database
        .select()
        .from(schema.goalPeriods)
        .where(eq(schema.goalPeriods.userId, userId))
    : [];
  const periodByGoal = groupPeriods(periods);
  const active: GoalSummary[] = [];
  const history: GoalSummary[] = [];
  for (const goal of rows) {
    const summary = await toSummary(database, goal, periodByGoal.get(goal.id) ?? [], now);
    if (goal.state === "active") active.push(summary);
    else history.push(summary);
  }
  return {
    active,
    history,
    activeCount: active.length,
    cap: MAX_ACTIVE_GOALS,
  };
}

export async function getGoalForUser(
  userId: string,
  goalId: string,
  now = new Date(),
): Promise<GoalDetail | null> {
  const database = getDatabase();
  const [goal] = await database
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
    .limit(1);
  if (!goal) return null;
  const periods = await database
    .select()
    .from(schema.goalPeriods)
    .where(eq(schema.goalPeriods.goalId, goal.id));
  const summary = await toSummary(database, goal, periods, now);
  const activeCount = await countActiveGoals(database, userId);
  const canReopen = goal.state === "expired" || goal.state === "reached" || goal.state === "archived";
  return {
    ...summary,
    prKind: (goal.prKind as GoalDetail["prKind"]) ?? null,
    prKey: goal.prKey,
    movementId: goal.movementId,
    movementName: goal.movementName,
    lane: (goal.lane as GoalDetail["lane"]) ?? null,
    helper: helperFor(goal),
    canMarkDone: goal.kind !== "volume"
      && goal.state === "active"
      && !periods.some((period) => period.state === "reached"),
    canReopen,
    reopenBlocked: canReopen && activeCount >= MAX_ACTIVE_GOALS,
    archivedAt: goal.state === "archived" ? goal.updatedAt.toISOString() : null,
  };
}

export async function createGoalForUser(input: CreateGoalInput) {
  if (!isValidTimeZone(input.timeZone)) {
    throw new GoalRequestError(GOAL_TIMEZONE_MESSAGE);
  }
  const now = input.now ?? new Date();
  const goalId = await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, input.userId);
    await settleExpiredGoals(transaction, input.userId, now);
    const slot = await allocateSlot(transaction, input.userId);
    const canonical = canonicalTarget({
      displayUnit: input.displayUnit,
      kind: input.kind,
      metric: input.metric,
      target: input.target,
    });
    const deadlineAt = input.deadlineAt
      ? exclusiveDeadlineAtEndOfLocalDay(input.deadlineAt, input.timeZone)
      : null;
    const pr = performanceIdentity(input);
    const title = titleFor({ ...input, targetValue: canonical, prKey: pr.prKey });
    const [goal] = await transaction
      .insert(schema.goals)
      .values({
        id: randomUUID(),
        userId: input.userId,
        title,
        kind: input.kind,
        metric: input.metric,
        sportFilter: input.sportFilter,
        targetValue: canonical,
        displayUnit: input.displayUnit,
        prKind: pr.prKind,
        prKey: pr.prKey,
        movementId: input.movementId,
        movementName: input.movementName,
        lane: input.lane,
        schedule: input.schedule,
        startsAt: now,
        deadlineAt,
        timeZone: input.timeZone,
        weekStartsOn: "sunday",
        activationAt: now,
        definitionVersion: 1,
        state: "active",
        activeSlot: slot,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!goal) throw new Error("Goal could not be created");
    await ensurePeriod(transaction, goal, now);
    return goal.id;
  });
  return getGoalForUser(input.userId, goalId, now);
}

export async function updateGoalForUser(input: CreateGoalInput & { goalId: string }) {
  const now = input.now ?? new Date();
  const goalId = await getDatabase().transaction(async (transaction) => {
    const [goal] = await transaction
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.id, input.goalId), eq(schema.goals.userId, input.userId)))
      .limit(1);
    if (!goal) return null;
    if (goal.state !== "active") {
      throw new GoalRequestError("Only an active goal can be edited");
    }
    const canonical = canonicalTarget({
      displayUnit: input.displayUnit,
      kind: input.kind,
      metric: input.metric,
      target: input.target,
    });
    const deadlineAt = input.deadlineAt
      ? exclusiveDeadlineAtEndOfLocalDay(input.deadlineAt, input.timeZone)
      : null;
    const pr = performanceIdentity(input);
    const title = titleFor({ ...input, targetValue: canonical, prKey: pr.prKey });
    await transaction
      .update(schema.goals)
      .set({
        title,
        kind: input.kind,
        metric: input.metric,
        sportFilter: input.sportFilter,
        targetValue: canonical,
        displayUnit: input.displayUnit,
        prKind: pr.prKind,
        prKey: pr.prKey,
        movementId: input.movementId,
        movementName: input.movementName,
        lane: input.lane,
        schedule: input.schedule,
        deadlineAt,
        timeZone: input.timeZone,
        definitionVersion: goal.definitionVersion + 1,
        updatedAt: now,
      })
      .where(eq(schema.goals.id, goal.id));
    const [updated] = await transaction
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.id, goal.id))
      .limit(1);
    if (!updated) return null;
    await transaction
      .update(schema.goalPeriods)
      .set({
        definitionVersion: updated.definitionVersion,
        targetValue: canonical,
        timeZone: updated.timeZone,
        periodEnd: updated.deadlineAt,
        creditClosesAt: creditClosesAt(updated.deadlineAt ?? currentPeriodEnd(updated, now), updated.timeZone),
        updatedAt: now,
      })
      .where(and(
        eq(schema.goalPeriods.goalId, updated.id),
        eq(schema.goalPeriods.state, "pending"),
      ));
    await recomputeGoal(transaction, updated, now);
    return updated.id;
  });
  if (!goalId) return null;
  return getGoalForUser(input.userId, goalId, now);
}

export async function archiveGoalForUser(userId: string, goalId: string) {
  const now = new Date();
  const updated = await getDatabase().transaction(async (transaction) => {
    const [goal] = await transaction
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
      .limit(1);
    if (!goal) return null;
    await transaction
      .update(schema.goals)
      .set({ state: "archived", activeSlot: null, updatedAt: now })
      .where(eq(schema.goals.id, goal.id));
    return goal.id;
  });
  if (!updated) return null;
  return getGoalForUser(userId, goalId, now);
}

export async function deleteGoalForUser(userId: string, goalId: string) {
  return getDatabase().transaction(async (transaction) => {
    const [goal] = await transaction
      .select({ id: schema.goals.id })
      .from(schema.goals)
      .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
      .limit(1);
    if (!goal) return false;
    await transaction.delete(schema.goals).where(eq(schema.goals.id, goal.id));
    return true;
  });
}

export async function markGoalDoneForUser(userId: string, goalId: string) {
  const now = new Date();
  const updated = await getDatabase().transaction(async (transaction) => {
    const [goal] = await transaction
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
      .limit(1);
    if (!goal) return null;
    if (goal.kind === "volume") {
      throw new GoalRequestError("Volume goals complete from workouts");
    }
    const period = await ensurePeriod(transaction, goal, now);
    if (period.state === "reached") return goal.id;
    await transaction
      .update(schema.goalPeriods)
      .set({
        state: "reached",
        completionMethod: "manual",
        reachedAt: now,
        recordedAt: now,
        progressValue: goal.targetValue,
        celebrated: true,
        updatedAt: now,
      })
      .where(eq(schema.goalPeriods.id, period.id));
    await transaction
      .update(schema.goals)
      .set({
        state: "reached",
        activeSlot: null,
        updatedAt: now,
      })
      .where(eq(schema.goals.id, goal.id));
    return goal.id;
  });
  if (!updated) return null;
  return getGoalForUser(userId, goalId, now);
}

export async function reopenGoalForUser(userId: string, goalId: string, now = new Date()) {
  const updatedId = await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, userId);
    await settleExpiredGoals(transaction, userId, now);
    const [goal] = await transaction
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
      .limit(1);
    if (!goal) return null;
    if (goal.state === "active") return goal.id;
    const slot = await allocateSlot(transaction, userId);
    const version = goal.definitionVersion + 1;
    await transaction
      .update(schema.goals)
      .set({
        state: "active",
        activeSlot: slot,
        activationAt: now,
        startsAt: now,
        definitionVersion: version,
        updatedAt: now,
      })
      .where(eq(schema.goals.id, goal.id));
    const [updated] = await transaction
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.id, goal.id))
      .limit(1);
    if (!updated) return null;
    await ensurePeriod(transaction, updated, now);
    return updated.id;
  });
  if (!updatedId) return null;
  return getGoalForUser(userId, goalId, now);
}

export async function evaluateGoalsForSession(input: {
  userId: string;
  sessionId: string;
  groupId?: string;
  transaction?: DatabaseTransaction;
  now?: Date;
}): Promise<GoalDetectionResult> {
  const run = async (transaction: DatabaseTransaction) => {
    const now = input.now ?? new Date();
    const reached = await recomputeUserGoals(transaction, input.userId, now, input.sessionId);
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    return {
      communityPostId: share.communityPostId,
      crewName: share.crewName,
      reached,
    };
  };
  if (input.transaction) return run(input.transaction);
  return getDatabase().transaction(run);
}

export async function recomputeGoalsForUser(input: {
  userId: string;
  transaction?: DatabaseTransaction;
  now?: Date;
}) {
  const run = async (transaction: DatabaseTransaction) => {
    await recomputeUserGoals(transaction, input.userId, input.now ?? new Date());
  };
  if (input.transaction) return run(input.transaction);
  return getDatabase().transaction(run);
}

export async function shareSessionGoalBadges(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  periodIds?: string[];
}): Promise<GoalBadge[]> {
  return getDatabase().transaction(async (transaction) => {
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    if (!share.communityPostId || share.postUserId !== input.userId) return [];
    if (input.periodIds?.length) {
      const requested = await transaction
        .select()
        .from(schema.goalPeriods)
        .where(and(
          eq(schema.goalPeriods.userId, input.userId),
          inArray(schema.goalPeriods.id, input.periodIds),
        ));
      if (requested.some((period) => period.completionMethod === "manual")) {
        throw new GoalRequestError(GOAL_HAND_MARK_SHARE_MESSAGE);
      }
    }
    const periods = await transaction
      .select()
      .from(schema.goalPeriods)
      .where(and(
        eq(schema.goalPeriods.userId, input.userId),
        eq(schema.goalPeriods.sourceSessionId, input.sessionId),
        eq(schema.goalPeriods.state, "reached"),
      ));
    const selected = periods.filter((period) => {
      if (input.periodIds?.length) return input.periodIds.includes(period.id);
      return true;
    });
    const badges: GoalBadge[] = [];
    for (const period of selected) {
      if (period.completionMethod === "manual") {
        throw new GoalRequestError(GOAL_HAND_MARK_SHARE_MESSAGE);
      }
      if (period.completionMethod !== "auto") continue;
      const [goal] = await transaction
        .select()
        .from(schema.goals)
        .where(eq(schema.goals.id, period.goalId))
        .limit(1);
      if (!goal) continue;
      const [inserted] = await transaction
        .insert(schema.communityPostGoals)
        .values({
          id: randomUUID(),
          postId: share.communityPostId,
          userId: input.userId,
          goalPeriodId: period.id,
          sourceSessionId: input.sessionId,
          displayLabel: goal.title,
          displayValue: resultDisplay(goal, period.progressValue ?? goal.targetValue),
          reachedAt: period.reachedAt ?? new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) badges.push(toGoalBadge(inserted));
    }
    return badges;
  });
}

export async function removeCommunityPostGoalBadges(input: {
  userId: string;
  sessionId: string;
  groupId: string;
}): Promise<GoalBadge[]> {
  return getDatabase().transaction(async (transaction) => {
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    if (!share.communityPostId || share.postUserId !== input.userId) return [];
    const existing = await transaction
      .select()
      .from(schema.communityPostGoals)
      .where(and(
        eq(schema.communityPostGoals.postId, share.communityPostId),
        eq(schema.communityPostGoals.userId, input.userId),
      ));
    if (!existing.length) return [];
    await transaction
      .delete(schema.communityPostGoals)
      .where(and(
        eq(schema.communityPostGoals.postId, share.communityPostId),
        eq(schema.communityPostGoals.userId, input.userId),
      ));
    return [];
  });
}

export async function restoreCommunityPostGoalBadges(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  periodIds: string[];
}): Promise<GoalBadge[]> {
  return shareSessionGoalBadges({
    groupId: input.groupId,
    periodIds: input.periodIds,
    sessionId: input.sessionId,
    userId: input.userId,
  });
}

export async function listGoalBadgesForPosts(postIds: string[]) {
  if (!postIds.length) return new Map<string, GoalBadge[]>();
  const rows = await getDatabase()
    .select()
    .from(schema.communityPostGoals)
    .where(inArray(schema.communityPostGoals.postId, postIds))
    .orderBy(asc(schema.communityPostGoals.createdAt), asc(schema.communityPostGoals.id));
  const badges = new Map<string, GoalBadge[]>();
  for (const row of rows) {
    const list = badges.get(row.postId) ?? [];
    list.push(toGoalBadge(row));
    badges.set(row.postId, list);
  }
  return badges;
}

async function recomputeUserGoals(
  transaction: DatabaseTransaction,
  userId: string,
  now: Date,
  celebratingSessionId?: string,
): Promise<GoalReached[]> {
  await lockUser(transaction, userId);
  await settleExpiredGoals(transaction, userId, now);
  const goals = await transaction
    .select()
    .from(schema.goals)
    .where(and(
      eq(schema.goals.userId, userId),
      inArray(schema.goals.state, ["active", "reached", "expired", "needs_review"]),
    ));
  const reached: GoalReached[] = [];
  for (const goal of goals) {
    const newly = await recomputeGoal(transaction, goal, now, celebratingSessionId);
    reached.push(...newly);
  }
  return reached;
}

async function recomputeGoal(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  now: Date,
  celebratingSessionId?: string,
): Promise<GoalReached[]> {
  const periods = await relevantPeriods(transaction, goal, now);
  const newly: GoalReached[] = [];
  for (const period of periods) {
    if (period.completionMethod === "manual" && period.state === "reached") continue;
    const window = periodWindow(period);
    const snapshots = await loadEligibleSnapshots(transaction, goal, window, now);
    const before = period.state;
    const celebrated = period.celebrated;
    if (goal.kind === "volume") {
      const { total, source } = accumulateVolume(goal, snapshots);
      await transaction
        .update(schema.goalPeriods)
        .set({ progressValue: total, updatedAt: now })
        .where(eq(schema.goalPeriods.id, period.id));
      if (total >= goal.targetValue && source) {
        const next = await markAutoReached(transaction, goal, period, source, total, now);
        if (next && !celebrated && source.id === celebratingSessionId) newly.push(next);
      } else if (before === "reached" && period.completionMethod === "auto") {
        await invalidateAutoPeriod(transaction, goal, period, now);
      }
    } else {
      let best = null as ReturnType<typeof qualifyingTimeCandidate>;
      let source: GoalSessionSnapshot | null = null;
      const ordered = [...snapshots].sort(byOccurrence);
      for (const snapshot of ordered) {
        const candidate = goal.kind === "time"
          ? qualifyingTimeCandidate(snapshot, asDefinition(goal))
          : qualifyingLiftCandidate(snapshot, asDefinition(goal));
        if (!candidate) continue;
        best = candidate;
        source = snapshot;
        break;
      }
      if (best && source) {
        const value = goal.kind === "time"
          ? best.metric.durationSeconds ?? goal.targetValue
          : best.metric.loadKg ?? goal.targetValue;
        const next = await markAutoReached(transaction, goal, period, source, value, now, best.sourceSetId);
        if (next && !celebrated && source.id === celebratingSessionId) newly.push(next);
      } else if (before === "reached" && period.completionMethod === "auto") {
        await invalidateAutoPeriod(transaction, goal, period, now);
      } else {
        await transaction
          .update(schema.goalPeriods)
          .set({ progressValue: bestValue(goal, snapshots), updatedAt: now })
          .where(eq(schema.goalPeriods.id, period.id));
      }
    }
  }
  return newly;
}

async function markAutoReached(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  period: PeriodRow,
  source: GoalSessionSnapshot,
  value: number,
  now: Date,
  sourceSetId?: string | null,
): Promise<GoalReached | null> {
  const share = await loadShareContext(transaction, source.id);
  await transaction
    .update(schema.goalPeriods)
    .set({
      state: "reached",
      completionMethod: "auto",
      reachedAt: source.occurredAt,
      recordedAt: now,
      sourceSessionId: source.id,
      sourceSetId: sourceSetId ?? null,
      originatingPostId: share.communityPostId,
      progressValue: value,
      evidence: {
        sessionId: source.id,
        setId: sourceSetId ?? null,
        value,
      },
      celebrated: true,
      updatedAt: now,
    })
    .where(eq(schema.goalPeriods.id, period.id));
  if (goal.schedule === "one_time") {
    await transaction
      .update(schema.goals)
      .set({ state: "reached", activeSlot: null, updatedAt: now })
      .where(eq(schema.goals.id, goal.id));
  }
  if (period.celebrated) return null;
  return {
    goalId: goal.id,
    kind: goal.kind as GoalKind,
    periodId: period.id,
    resultLine: resultDisplay(goal, value),
    targetLine: `target ${targetDisplay(goal)}`,
    title: goal.title,
  };
}

async function invalidateAutoPeriod(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  period: PeriodRow,
  now: Date,
) {
  await transaction
    .delete(schema.communityPostGoals)
    .where(eq(schema.communityPostGoals.goalPeriodId, period.id));
  await transaction
    .update(schema.goalPeriods)
    .set({
      state: "pending",
      completionMethod: null,
      reachedAt: null,
      recordedAt: null,
      sourceSessionId: null,
      sourceSetId: null,
      originatingPostId: null,
      evidence: null,
      celebrated: false,
      updatedAt: now,
    })
    .where(eq(schema.goalPeriods.id, period.id));
  if (goal.schedule === "one_time" && (goal.state === "reached" || goal.state === "expired")) {
    try {
      const slot = await allocateSlot(transaction, goal.userId);
      await transaction
        .update(schema.goals)
        .set({ state: "active", activeSlot: slot, updatedAt: now })
        .where(eq(schema.goals.id, goal.id));
    } catch (error) {
      if (error instanceof GoalRequestError && error.statusCode === 409) {
        await transaction
          .update(schema.goals)
          .set({ state: "needs_review", activeSlot: null, updatedAt: now })
          .where(eq(schema.goals.id, goal.id));
      } else {
        throw error;
      }
    }
  }
}

async function relevantPeriods(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  now: Date,
) {
  const current = await ensurePeriod(transaction, goal, now);
  const rows = await transaction
    .select()
    .from(schema.goalPeriods)
    .where(eq(schema.goalPeriods.goalId, goal.id));
  return rows.filter((period) => {
    if (period.id === current.id) return true;
    if (period.state === "reached") return true;
    if (period.creditClosesAt && now < period.creditClosesAt) return true;
    return false;
  });
}

async function ensurePeriod(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  now: Date,
): Promise<PeriodRow> {
  const calendar = currentCalendarPeriod(now, goal.timeZone, goal.schedule as "weekly" | "monthly" | "one_time", goal.deadlineAt);
  const periodStart = calendar.start;
  const periodEnd = calendar.end;
  const eligibleStart = goal.activationAt > periodStart ? goal.activationAt : periodStart;
  const existing = await transaction
    .select()
    .from(schema.goalPeriods)
    .where(and(
      eq(schema.goalPeriods.goalId, goal.id),
      eq(schema.goalPeriods.definitionVersion, goal.definitionVersion),
      eq(schema.goalPeriods.periodKey, calendar.key),
    ))
    .limit(1);
  if (existing[0]) return existing[0];
  const [inserted] = await transaction
    .insert(schema.goalPeriods)
    .values({
      id: randomUUID(),
      goalId: goal.id,
      userId: goal.userId,
      definitionVersion: goal.definitionVersion,
      periodKey: calendar.key,
      periodStart,
      periodEnd,
      eligibleStart,
      timeZone: goal.timeZone,
      targetValue: goal.targetValue,
      creditClosesAt: creditClosesAt(periodEnd, goal.timeZone),
      state: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) throw new Error("Goal period could not be created");
  return inserted;
}

async function settleExpiredGoals(transaction: DatabaseTransaction, userId: string, now: Date) {
  const active = await transaction
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.state, "active")));
  for (const goal of active) {
    if (goal.schedule !== "one_time" || !goal.deadlineAt) continue;
    if (now >= goal.deadlineAt) {
      const [period] = await transaction
        .select()
        .from(schema.goalPeriods)
        .where(and(eq(schema.goalPeriods.goalId, goal.id), eq(schema.goalPeriods.state, "reached")))
        .limit(1);
      if (period) continue;
      await transaction
        .update(schema.goals)
        .set({ state: "expired", activeSlot: null, updatedAt: now })
        .where(eq(schema.goals.id, goal.id));
    }
  }
}

async function allocateSlot(transaction: DatabaseTransaction, userId: string) {
  const occupied = await transaction
    .select({ slot: schema.goals.activeSlot })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), isNotNull(schema.goals.activeSlot)));
  const slot = nextActiveSlot(occupied.map((row) => row.slot));
  if (slot == null) throw new GoalRequestError(GOAL_CAP_MESSAGE, 409);
  return slot;
}

async function countActiveGoals(database: Queryable, userId: string) {
  const rows = await database
    .select({ slot: schema.goals.activeSlot })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.state, "active")));
  return rows.length;
}

async function lockUser(transaction: DatabaseTransaction, userId: string) {
  await transaction
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
    .for("update");
}

async function loadEligibleSnapshots(
  transaction: Queryable,
  goal: GoalRow,
  period: GoalPeriodWindow,
  now: Date,
) {
  const filters = [
    eq(schema.workoutSessions.userId, goal.userId),
    sql`${schema.workoutSessions.createdAt} > ${goal.activationAt}`,
    gte(schema.workoutSessions.occurredAt, period.eligibleStart),
    lte(schema.workoutSessions.occurredAt, now),
  ];
  if (period.periodEnd) filters.push(sql`${schema.workoutSessions.occurredAt} < ${period.periodEnd}`);
  if (period.creditClosesAt) {
    filters.push(sql`${schema.workoutSessions.createdAt} < ${period.creditClosesAt}`);
  }
  if (goal.sportFilter) filters.push(eq(schema.workoutSessions.workoutType, goal.sportFilter));
  const sessions = await transaction
    .select()
    .from(schema.workoutSessions)
    .where(and(...filters))
    .orderBy(asc(schema.workoutSessions.occurredAt), asc(schema.workoutSessions.createdAt));
  return loadSnapshots(transaction, sessions);
}

async function loadSnapshots(
  transaction: Queryable,
  sessions: Array<typeof schema.workoutSessions.$inferSelect>,
): Promise<GoalSessionSnapshot[]> {
  if (!sessions.length) return [];
  const sessionIds = sessions.map((session) => session.id);
  const [metrics, segments, movements] = await Promise.all([
    transaction
      .select()
      .from(schema.workoutSessionMetrics)
      .where(inArray(schema.workoutSessionMetrics.workoutSessionId, sessionIds)),
    transaction
      .select()
      .from(schema.workoutSessionSegments)
      .where(inArray(schema.workoutSessionSegments.workoutSessionId, sessionIds)),
    transaction
      .select()
      .from(schema.sessionMovementResults)
      .where(inArray(schema.sessionMovementResults.workoutSessionId, sessionIds))
      .orderBy(asc(schema.sessionMovementResults.position)),
  ]);
  const sets = movements.length
    ? await transaction
        .select()
        .from(schema.setResults)
        .where(inArray(
          schema.setResults.sessionMovementResultId,
          movements.map((movement) => movement.id),
        ))
    : [];
  return sessions.map((session) => ({
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt,
    occurredAt: session.occurredAt,
    workoutType: session.workoutType,
    workoutSubtype: session.workoutSubtype,
    workoutFormat: session.workoutFormat,
    formatDurationSeconds: session.formatDurationSeconds,
    timeCapSeconds: session.timeCapSeconds,
    scoreFinished: session.scoreFinished,
    scoreTimeSeconds: session.scoreTimeSeconds,
    scoreRounds: session.scoreRounds,
    scoreReps: session.scoreReps,
    name: session.name,
    durationMinutes: session.durationMinutes,
    metrics: metrics.filter((metric) => metric.workoutSessionId === session.id),
    segments: segments.filter((segment) => segment.workoutSessionId === session.id),
    movements: movements
      .filter((movement) => movement.workoutSessionId === session.id)
      .map((movement) => ({
        id: movement.id,
        movementId: movement.movementId,
        movementName: movement.movementName,
        position: movement.position,
        sets: sets.filter((set) => set.sessionMovementResultId === movement.id),
      })),
  }));
}

async function toSummary(
  database: Queryable,
  goal: GoalRow,
  periods: PeriodRow[],
  now: Date,
): Promise<GoalSummary> {
  const current = pickCurrentPeriod(goal, periods, now);
  const progress = await progressFor(database, goal, current, now);
  const reachedPeriod = periods.find((period) => period.state === "reached");
  const shareCrew = reachedPeriod?.originatingPostId
    ? await crewNameForPost(database, reachedPeriod.originatingPostId)
    : null;
  const sourceGroupId = reachedPeriod?.originatingPostId
    ? await groupIdForPost(database, reachedPeriod.originatingPostId)
    : null;
  return {
    id: goal.id,
    title: goal.title,
    kind: goal.kind as GoalKind,
    metric: goal.metric as GoalMetric,
    sportFilter: (goal.sportFilter as WorkoutType | null) ?? null,
    schedule: goal.schedule as GoalSchedule,
    state: goal.state as GoalState,
    displayUnit: goal.displayUnit,
    targetValue: goal.targetValue,
    timeZone: goal.timeZone,
    activationAt: goal.activationAt.toISOString(),
    deadlineAt: goal.deadlineAt?.toISOString() ?? null,
    activeSlot: goal.activeSlot,
    createdAt: goal.createdAt.toISOString(),
    progress,
    completionMethod: (reachedPeriod?.completionMethod as GoalSummary["completionMethod"]) ?? null,
    shareable: reachedPeriod?.completionMethod === "auto" && Boolean(reachedPeriod.originatingPostId),
    shareCrewName: shareCrew,
    sourceSessionId: reachedPeriod?.sourceSessionId ?? null,
    sourceGroupId,
    currentPeriodId: current?.id ?? reachedPeriod?.id ?? null,
  };
}

async function progressFor(
  database: Queryable,
  goal: GoalRow,
  period: PeriodRow | null,
  now: Date,
): Promise<GoalProgress> {
  const calendar = currentCalendarPeriod(
    now,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  );
  const window = period ? periodWindow(period) : {
    periodStart: calendar.start,
    periodEnd: calendar.end,
    eligibleStart: goal.activationAt > calendar.start ? goal.activationAt : calendar.start,
    creditClosesAt: creditClosesAt(calendar.end, goal.timeZone),
  };
  const snapshots = await loadEligibleSnapshots(database, goal, window, now);
  const periodLabel = formatPeriodLabel(goal, window);
  if (goal.kind === "volume") {
    const { total } = accumulateVolume(goal, snapshots);
    const last = snapshots.at(-1);
    return {
      current: total,
      target: goal.targetValue,
      ratio: Math.min(1, total / goal.targetValue),
      label: volumeProgressLabel(goal, total, periodLabel),
      periodLabel,
      lastQualifyingLabel: last ? formatLastLog(last, goal.timeZone) : null,
    };
  }
  const best = bestValue(goal, snapshots);
  const status = deadlineLabel(goal);
  return {
    current: best ?? 0,
    target: goal.targetValue,
    ratio: progressRatio(goal, best),
    label: performanceProgressLabel(goal, best, status),
    periodLabel: status,
    lastQualifyingLabel: null,
  };
}

function accumulateVolume(goal: GoalRow, snapshots: GoalSessionSnapshot[]) {
  let total = 0;
  let source: GoalSessionSnapshot | null = null;
  for (const snapshot of [...snapshots].sort(byOccurrence)) {
    const contribution = sessionVolumeContribution(snapshot, goal.metric as GoalDefinition["metric"]);
    if (contribution == null) continue;
    total += contribution;
    if (!source && total >= goal.targetValue) source = snapshot;
  }
  return { total, source };
}

function bestValue(goal: GoalRow, snapshots: GoalSessionSnapshot[]) {
  let best: number | null = null;
  for (const snapshot of snapshots) {
    const candidate = goal.kind === "time"
      ? qualifyingTimeCandidate(snapshot, asDefinition(goal))
        ?? extractGoalPerformanceCandidates(snapshot).find((item) => item.key === goal.prKey)
      : qualifyingLiftCandidate(snapshot, asDefinition(goal))
        ?? extractGoalPerformanceCandidates(snapshot).find((item) => item.key === goal.prKey);
    if (!candidate) continue;
    const value = goal.kind === "time" ? candidate.metric.durationSeconds : candidate.metric.loadKg;
    if (value == null) continue;
    if (best == null) {
      best = value;
      continue;
    }
    if (goal.kind === "time" && value < best) best = value;
    if (goal.kind === "lift" && value > best) best = value;
  }
  return best;
}

function progressRatio(goal: GoalRow, best: number | null) {
  if (best == null || best <= 0) return 0;
  if (goal.kind === "time") return Math.min(1, goal.targetValue / best);
  return Math.min(1, best / goal.targetValue);
}

function volumeProgressLabel(goal: GoalRow, total: number, periodLabel: string | null) {
  const target = targetDisplay(goal);
  const prefix = goal.metric === "distance"
    ? `${formatDistanceDisplay(total, goal.displayUnit).replace(/ (mi|km|m)$/, "")} of ${target}`
    : goal.metric === "minutes"
      ? `${Math.round(total / 60)} of ${target}`
      : `${total} of ${target}`;
  return periodLabel ? `${prefix} · ${periodLabel}` : prefix;
}

function performanceProgressLabel(goal: GoalRow, best: number | null, status: string) {
  if (best == null) {
    return status ? `No result yet · ${status}` : "No result yet";
  }
  if (goal.kind === "time") {
    return `Best so far ${formatClock(best)} · ${status}`;
  }
  return `Best ${formatLiftDisplay(best, goal.displayUnit)} · ${status}`;
}

function deadlineLabel(goal: GoalRow) {
  if (!goal.deadlineAt) return "no deadline";
  return `due ${formatDueDate(goal.deadlineAt, goal.timeZone)}`;
}

function formatPeriodLabel(goal: GoalRow, window: GoalPeriodWindow) {
  if (goal.schedule === "one_time") return deadlineLabel(goal);
  return formatShortRange(window.eligibleStart, window.periodEnd, goal.timeZone);
}

function formatLastLog(session: GoalSessionSnapshot, timeZone: string) {
  const parts = zonedParts(session.occurredAt, timeZone);
  return `Last log ${parts.month}/${parts.day}`;
}

function targetDisplay(goal: GoalRow) {
  if (goal.metric === "distance") return formatDistanceDisplay(goal.targetValue, goal.displayUnit);
  if (goal.metric === "minutes") return `${Math.round(goal.targetValue / 60)} min`;
  if (goal.metric === "workout_count") return formatCountDisplay(goal.targetValue);
  if (goal.kind === "time") return formatTimeTarget(goal.targetValue);
  return formatLiftDisplay(goal.targetValue, goal.displayUnit);
}

function resultDisplay(goal: GoalRow, value: number) {
  if (goal.metric === "distance") return formatDistanceDisplay(value, goal.displayUnit);
  if (goal.metric === "minutes") return formatMinutesDisplay(value);
  if (goal.metric === "workout_count") return formatCountDisplay(value);
  if (goal.kind === "time") return formatClock(value);
  return formatLiftDisplay(value, goal.displayUnit);
}

function helperFor(goal: GoalRow) {
  if (goal.kind === "time") {
    const sport = goal.sportFilter === "cycling" ? "ride" : goal.sportFilter ?? "run";
    return `Reached when a qualifying ${sport} is strictly faster than ${formatTimeTarget(goal.targetValue)}.`;
  }
  if (goal.kind === "lift") {
    return `Reached on any 1-rep set at or above ${formatLiftDisplay(goal.targetValue, goal.displayUnit)}.`;
  }
  return "Only workouts logged after you created this goal count.";
}

function titleFor(input: {
  kind: GoalKind;
  metric: GoalMetric;
  target: number;
  targetValue: number;
  displayUnit: string | null;
  schedule: GoalSchedule;
  movementName: string | null;
  lane: string | null;
  prKey: string | null;
}) {
  if (input.kind === "time") return timeGoalTitle(input.targetValue, input.lane);
  if (input.kind === "lift") return liftGoalTitle(input.movementName ?? "Lift", input.targetValue, input.displayUnit);
  return volumeGoalTitle({
    displayUnit: input.displayUnit,
    metric: input.metric,
    schedule: input.schedule,
    target: input.target,
  });
}

function performanceIdentity(input: {
  kind: GoalKind;
  sportFilter: string | null;
  lane: string | null;
  movementId: string | null;
  movementName: string | null;
}) {
  if (input.kind === "time" && input.sportFilter && input.lane) {
    return { prKind: "distance_time", prKey: `dt:${input.sportFilter}:${input.lane}` };
  }
  if (input.kind === "lift") {
    return {
      prKind: "heaviest_single",
      prKey: `hs:${movementIdentity(input.movementId, input.movementName ?? "")}`,
    };
  }
  return { prKind: null, prKey: null };
}

function asDefinition(goal: GoalRow): GoalDefinition {
  return {
    activationAt: goal.activationAt,
    displayUnit: goal.displayUnit,
    kind: goal.kind as GoalDefinition["kind"],
    metric: goal.metric as GoalDefinition["metric"],
    prKey: goal.prKey,
    prKind: goal.prKind,
    sportFilter: goal.sportFilter,
    targetValue: goal.targetValue,
    timeZone: goal.timeZone,
  };
}

function periodWindow(period: PeriodRow): GoalPeriodWindow {
  return {
    creditClosesAt: period.creditClosesAt,
    eligibleStart: period.eligibleStart,
    periodEnd: period.periodEnd,
    periodStart: period.periodStart,
  };
}

function currentPeriodEnd(goal: GoalRow, now: Date) {
  return currentCalendarPeriod(
    now,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  ).end;
}

function pickCurrentPeriod(goal: GoalRow, periods: PeriodRow[], now: Date) {
  const calendar = currentCalendarPeriod(
    now,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  );
  return periods.find((period) => period.periodKey === calendar.key && period.definitionVersion === goal.definitionVersion)
    ?? periods.find((period) => period.state === "reached")
    ?? periods.at(-1)
    ?? null;
}

function groupPeriods(periods: PeriodRow[]) {
  const map = new Map<string, PeriodRow[]>();
  for (const period of periods) {
    const list = map.get(period.goalId) ?? [];
    list.push(period);
    map.set(period.goalId, list);
  }
  return map;
}

function byOccurrence(left: GoalSessionSnapshot, right: GoalSessionSnapshot) {
  const occurred = left.occurredAt.getTime() - right.occurredAt.getTime();
  if (occurred !== 0) return occurred;
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) return created;
  return left.id.localeCompare(right.id);
}

function toGoalBadge(row: typeof schema.communityPostGoals.$inferSelect): GoalBadge {
  return {
    id: row.id,
    label: row.displayLabel,
    periodId: row.goalPeriodId,
    value: row.displayValue,
  };
}

async function loadShareContext(
  database: Queryable,
  sessionId: string,
  groupId?: string,
) {
  const filters = [eq(schema.communityPosts.workoutSessionId, sessionId), isNull(schema.communityPosts.removedAt)];
  if (groupId) filters.push(eq(schema.communityPosts.groupId, groupId));
  const [post] = await database
    .select({
      communityPostId: schema.communityPosts.id,
      crewName: schema.groups.name,
      postUserId: schema.communityPosts.userId,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.communityPosts.groupId, schema.groups.id))
    .where(and(...filters))
    .limit(1);
  return {
    communityPostId: post?.communityPostId ?? null,
    crewName: post?.crewName ?? null,
    postUserId: post?.postUserId ?? null,
  };
}

async function crewNameForPost(database: Queryable, postId: string) {
  const [row] = await database
    .select({ name: schema.groups.name })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.communityPosts.groupId, schema.groups.id))
    .where(eq(schema.communityPosts.id, postId))
    .limit(1);
  return row?.name ?? null;
}

async function groupIdForPost(database: Queryable, postId: string) {
  const [row] = await database
    .select({ groupId: schema.communityPosts.groupId })
    .from(schema.communityPosts)
    .where(eq(schema.communityPosts.id, postId))
    .limit(1);
  return row?.groupId ?? null;
}

export { loadSnapshots as loadGoalSessionSnapshots };
export { startOfZonedDay };
