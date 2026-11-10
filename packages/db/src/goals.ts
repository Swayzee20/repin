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
  ne,
  sql,
} from "drizzle-orm";

import {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import {
  addZonedDays,
  creditClosesAt,
  currentCalendarPeriod,
  exclusiveDeadlineFromInput,
  formatDueDate,
  formatShortRange,
  isValidTimeZone,
  startOfZonedDay,
  zonedDayDiff,
  zonedParts,
} from "./goal-calendar";
import {
  activeMembership,
  crewAuthorVisibleSql,
  openGroup,
} from "./membership";
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
export const GOAL_TIMEZONE_LOCKED_MESSAGE = "This goal's time zone is locked";
export const GOAL_SHARE_UNAVAILABLE_MESSAGE = "This goal isn't available to share.";
export const GOAL_REOPEN_DEADLINE_MESSAGE = "Choose a future end date";
export const GOAL_REOPEN_CAP_MESSAGE =
  "You already have 5 active goals. Archive one first, then you can reopen this.";
export const GOAL_STALE_MESSAGE = "This goal was just updated. Refresh and try again.";

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
  deadlineAt: Date | string | null;
  timeZone: string;
  movementId: string | null;
  movementName: string | null;
  lane: string | null;
  now?: Date;
};

export async function listGoalsForUser(userId: string, now = new Date()): Promise<GoalsListResponse> {
  await settleUserGoalReads(userId, now);
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
  await settleUserGoalReads(userId, now);
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
  const currentVersion = periods.filter((period) => period.definitionVersion === goal.definitionVersion);
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
      && !currentVersion.some((period) => period.state === "reached"),
    canReopen,
    reopenBlocked: canReopen && activeCount >= MAX_ACTIVE_GOALS,
    archivedAt: goal.archivedAt?.toISOString() ?? null,
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
      ? exclusiveDeadlineFromInput(input.deadlineAt, input.timeZone)
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
    await lockUser(transaction, input.userId);
    const goal = await lockGoalForUser(transaction, input.userId, input.goalId);
    if (!goal) return null;
    if (goal.state !== "active") {
      throw new GoalRequestError("Only an active goal can be edited", 409);
    }
    if (input.timeZone && input.timeZone !== goal.timeZone) {
      throw new GoalRequestError(GOAL_TIMEZONE_LOCKED_MESSAGE);
    }
    const canonical = canonicalTarget({
      displayUnit: input.displayUnit,
      kind: input.kind,
      metric: input.metric,
      target: input.target,
    });
    const deadlineAt = resolveUpdatedDeadline(input.deadlineAt, goal);
    const pr = performanceIdentity(input);
    const title = titleFor({ ...input, targetValue: canonical, prKey: pr.prKey });
    const definitionChanged = goal.kind !== input.kind
      || goal.metric !== input.metric
      || goal.sportFilter !== input.sportFilter
      || goal.targetValue !== canonical
      || goal.displayUnit !== input.displayUnit
      || goal.prKind !== pr.prKind
      || goal.prKey !== pr.prKey
      || goal.movementId !== input.movementId
      || goal.movementName !== input.movementName
      || goal.lane !== input.lane
      || goal.schedule !== input.schedule;
    const deadlineChanged = (deadlineAt?.getTime() ?? null) !== (goal.deadlineAt?.getTime() ?? null);
    if (!definitionChanged && !deadlineChanged) return goal.id;
    const nextVersion = definitionChanged ? goal.definitionVersion + 1 : goal.definitionVersion;
    const [updated] = await transaction
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
        definitionVersion: nextVersion,
        updatedAt: now,
      })
      .where(and(
        eq(schema.goals.id, goal.id),
        eq(schema.goals.state, "active"),
      ))
      .returning();
    if (!updated) throw new GoalRequestError(GOAL_STALE_MESSAGE, 409);
    if (!definitionChanged && updated.schedule === "one_time") {
      await transaction
        .update(schema.goalPeriods)
        .set({
          periodEnd: updated.deadlineAt,
          creditClosesAt: creditClosesAt(updated.deadlineAt, updated.timeZone),
          updatedAt: now,
        })
        .where(and(
          eq(schema.goalPeriods.goalId, updated.id),
          eq(schema.goalPeriods.definitionVersion, updated.definitionVersion),
          eq(schema.goalPeriods.state, "pending"),
        ));
    }
    await recomputeGoal(transaction, updated, now);
    return updated.id;
  });
  if (!goalId) return null;
  return getGoalForUser(input.userId, goalId, now);
}

export async function archiveGoalForUser(userId: string, goalId: string) {
  const now = new Date();
  const updated = await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, userId);
    const goal = await lockGoalForUser(transaction, userId, goalId);
    if (!goal) return null;
    if (goal.state === "archived") return goal.id;
    const [archived] = await transaction
      .update(schema.goals)
      .set({
        state: "archived",
        activeSlot: null,
        archivedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.goals.id, goal.id),
        eq(schema.goals.userId, userId),
        ne(schema.goals.state, "archived"),
        isNull(schema.goals.archivedAt),
      ))
      .returning();
    if (!archived) throw new GoalRequestError(GOAL_STALE_MESSAGE, 409);
    return archived.id;
  });
  if (!updated) return null;
  return getGoalForUser(userId, goalId, now);
}

export async function deleteGoalForUser(userId: string, goalId: string) {
  return getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, userId);
    const goal = await lockGoalForUser(transaction, userId, goalId);
    if (!goal) return false;
    const deleted = await transaction
      .delete(schema.goals)
      .where(and(eq(schema.goals.id, goal.id), eq(schema.goals.userId, userId)))
      .returning({ id: schema.goals.id });
    if (!deleted[0]) throw new GoalRequestError(GOAL_STALE_MESSAGE, 409);
    return true;
  });
}

export async function markGoalDoneForUser(userId: string, goalId: string) {
  const now = new Date();
  const updated = await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, userId);
    const goal = await lockGoalForUser(transaction, userId, goalId);
    if (!goal) return null;
    if (goal.state !== "active") {
      throw new GoalRequestError("Only an active goal can be marked done", 409);
    }
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
    const [reached] = await transaction
      .update(schema.goals)
      .set({
        state: "reached",
        activeSlot: null,
        updatedAt: now,
      })
      .where(and(eq(schema.goals.id, goal.id), eq(schema.goals.state, "active")))
      .returning({ id: schema.goals.id });
    if (!reached) throw new GoalRequestError(GOAL_STALE_MESSAGE, 409);
    return reached.id;
  });
  if (!updated) return null;
  return getGoalForUser(userId, goalId, now);
}

export async function reopenGoalForUser(input: {
  userId: string;
  goalId: string;
  now?: Date;
  deadlineAt?: Date | string | null;
}) {
  const now = input.now ?? new Date();
  const updatedId = await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, input.userId);
    await settleExpiredGoals(transaction, input.userId, now);
    const goal = await lockGoalForUser(transaction, input.userId, input.goalId);
    if (!goal) return null;
    if (goal.state === "active") return goal.id;
    const slot = await allocateSlot(transaction, input.userId);
    const version = goal.definitionVersion + 1;
    const deadlineAt = nextDeadlineAfterReopen(goal, now, input.deadlineAt);
    const [updated] = await transaction
      .update(schema.goals)
      .set({
        state: "active",
        activeSlot: slot,
        activationAt: now,
        startsAt: now,
        deadlineAt,
        definitionVersion: version,
        archivedAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(schema.goals.id, goal.id),
        eq(schema.goals.state, goal.state),
      ))
      .returning();
    if (!updated) throw new GoalRequestError(GOAL_STALE_MESSAGE, 409);
    await ensurePeriod(transaction, updated, now);
    return updated.id;
  });
  if (!updatedId) return null;
  return getGoalForUser(input.userId, input.goalId, now);
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
    const session = await transaction
      .select({ occurredAt: schema.workoutSessions.occurredAt })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, input.sessionId))
      .limit(1);
    const reached = await recomputeUserGoals(
      transaction,
      input.userId,
      now,
      input.sessionId,
      session[0]?.occurredAt,
    );
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
      if (!period.originatingPostId || period.sourceSessionId !== input.sessionId) {
        throw new GoalRequestError(GOAL_SHARE_UNAVAILABLE_MESSAGE, 403);
      }
      const origin = await loadAuthorizedOriginPost(transaction, {
        groupId: input.groupId,
        originatingPostId: period.originatingPostId,
        sessionId: input.sessionId,
        userId: input.userId,
      });
      if (!origin) {
        throw new GoalRequestError(GOAL_SHARE_UNAVAILABLE_MESSAGE, 403);
      }
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
          postId: origin.communityPostId,
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
    const share = await loadAuthorizedSessionPost(transaction, {
      groupId: input.groupId,
      sessionId: input.sessionId,
      userId: input.userId,
    });
    if (!share) return [];
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
  occurredAt?: Date,
): Promise<GoalReached[]> {
  await lockUser(transaction, userId);
  await settleExpiredGoals(transaction, userId, now);
  const goals = await transaction
    .select()
    .from(schema.goals)
    .where(and(
      eq(schema.goals.userId, userId),
      inArray(schema.goals.state, ["active", "reached", "expired", "needs_review", "archived"]),
    ));
  const reached: GoalReached[] = [];
  for (const goal of goals) {
    const newly = await recomputeGoal(transaction, goal, now, celebratingSessionId, occurredAt);
    reached.push(...newly);
  }
  return reached;
}

async function recomputeGoal(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  now: Date,
  celebratingSessionId?: string,
  occurredAt?: Date,
): Promise<GoalReached[]> {
  if (goal.state === "archived") {
    if (!goal.archivedAt) return [];
    const archived = await transaction
      .select()
      .from(schema.goalPeriods)
      .where(eq(schema.goalPeriods.goalId, goal.id));
    for (const period of archived) {
      if (period.completionMethod === "auto" && period.state === "reached") {
        await revalidateExistingAuto(
          transaction,
          goal,
          period,
          asPeriodDefinition(period),
          now,
          goal.archivedAt ?? undefined,
        );
      }
    }
    return [];
  }
  const periods = await relevantPeriods(transaction, goal, now, occurredAt);
  const newly: GoalReached[] = [];
  for (const period of periods) {
    if (period.completionMethod === "manual" && period.state === "reached") continue;
    const definition = asPeriodDefinition(period);
    const currentVersion = period.definitionVersion === goal.definitionVersion;
    if (!currentVersion) {
      if (period.completionMethod === "auto" && period.state === "reached") {
        await revalidateExistingAuto(transaction, goal, period, definition, now);
      }
      continue;
    }
    const window = periodWindow(period);
    const snapshots = await loadEligibleSnapshots(transaction, definition, window, now);
    const before = period.state;
    const celebrated = period.celebrated;
    if (definition.kind === "volume") {
      const { total, source } = accumulateVolume(definition, snapshots);
      await transaction
        .update(schema.goalPeriods)
        .set({ progressValue: total, updatedAt: now })
        .where(eq(schema.goalPeriods.id, period.id));
      if (total >= definition.targetValue && source) {
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
        const candidate = definition.kind === "time"
          ? qualifyingTimeCandidate(snapshot, definition)
          : qualifyingLiftCandidate(snapshot, definition);
        if (!candidate) continue;
        best = candidate;
        source = snapshot;
        break;
      }
      if (best && source) {
        const value = definition.kind === "time"
          ? best.metric.durationSeconds ?? definition.targetValue
          : best.metric.loadKg ?? definition.targetValue;
        const next = await markAutoReached(transaction, goal, period, source, value, now, best.sourceSetId);
        if (next && !celebrated && source.id === celebratingSessionId) newly.push(next);
      } else if (before === "reached" && period.completionMethod === "auto") {
        await invalidateAutoPeriod(transaction, goal, period, now);
      } else {
        await transaction
          .update(schema.goalPeriods)
          .set({ progressValue: bestValue(definition, snapshots), updatedAt: now })
          .where(eq(schema.goalPeriods.id, period.id));
      }
    }
  }
  return newly;
}

async function revalidateExistingAuto(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  period: PeriodRow,
  definition: GoalDefinition,
  now: Date,
  archiveCutoff?: Date,
) {
  if (!period.sourceSessionId) {
    await invalidateAutoPeriod(transaction, goal, period, now);
    return;
  }
  const window = periodWindow(period);
  const snapshots = await loadEligibleSnapshots(
    transaction,
    asPeriodDefinition(period),
    window,
    now,
    archiveCutoff,
  );
  const source = snapshots.find((snapshot) => snapshot.id === period.sourceSessionId);
  if (!source) {
    await invalidateAutoPeriod(transaction, goal, period, now);
    return;
  }
  if (definition.kind === "volume") {
    const { total } = accumulateVolume(definition, snapshots);
    if (total < definition.targetValue) {
      await invalidateAutoPeriod(transaction, goal, period, now);
    }
    return;
  }
  const candidate = definition.kind === "time"
    ? qualifyingTimeCandidate(source, definition)
    : qualifyingLiftCandidate(source, definition);
  if (!candidate) {
    await invalidateAutoPeriod(transaction, goal, period, now);
  }
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
  const sameSource = Boolean(period.sourceSessionId && period.sourceSessionId === source.id);
  const sourceChanged = Boolean(period.sourceSessionId && period.sourceSessionId !== source.id);
  let originatingPostId = period.originatingPostId;
  if (!sameSource) {
    const share = await loadShareContext(transaction, source.id);
    originatingPostId = share.communityPostId;
  }
  if (sourceChanged) {
    await transaction
      .delete(schema.communityPostGoals)
      .where(eq(schema.communityPostGoals.goalPeriodId, period.id));
  }
  await transaction
    .update(schema.goalPeriods)
    .set({
      state: "reached",
      completionMethod: "auto",
      reachedAt: source.occurredAt,
      recordedAt: now,
      sourceSessionId: source.id,
      sourceSetId: sourceSetId ?? null,
      originatingPostId,
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
  if (sameSource) {
    await transaction
      .update(schema.communityPostGoals)
      .set({
        displayValue: resultDisplay(goal, value),
        reachedAt: source.occurredAt,
      })
      .where(eq(schema.communityPostGoals.goalPeriodId, period.id));
  }
  if (goal.schedule === "one_time" && goal.state !== "archived") {
    await transaction
      .update(schema.goals)
      .set({ state: "reached", activeSlot: null, updatedAt: now })
      .where(and(eq(schema.goals.id, goal.id), eq(schema.goals.state, "active")));
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
  if (
    period.definitionVersion === goal.definitionVersion
    && goal.schedule === "one_time"
    && (goal.state === "reached" || goal.state === "expired")
  ) {
    try {
      const slot = await allocateSlot(transaction, goal.userId);
      await transaction
        .update(schema.goals)
        .set({ state: "active", activeSlot: slot, updatedAt: now })
        .where(and(
          eq(schema.goals.id, goal.id),
          inArray(schema.goals.state, ["reached", "expired"]),
        ));
    } catch (error) {
      if (error instanceof GoalRequestError && error.statusCode === 409) {
        await transaction
          .update(schema.goals)
          .set({ state: "needs_review", activeSlot: null, updatedAt: now })
          .where(and(
            eq(schema.goals.id, goal.id),
            inArray(schema.goals.state, ["reached", "expired"]),
          ));
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
  occurredAt?: Date,
) {
  const canMaterialize = goal.state === "active"
    || goal.state === "needs_review"
    || (goal.schedule === "one_time" && (goal.state === "reached" || goal.state === "expired"));
  let current: PeriodRow | null = null;
  if (canMaterialize) {
    current = await ensurePeriod(transaction, goal, now);
    if (occurredAt) await ensurePeriodForInstant(transaction, goal, occurredAt, now);
  }
  const rows = await transaction
    .select()
    .from(schema.goalPeriods)
    .where(eq(schema.goalPeriods.goalId, goal.id));
  return rows.filter((period) => {
    if (current && period.id === current.id) return true;
    if (period.completionMethod === "auto" && period.state === "reached") return true;
    if (period.definitionVersion === goal.definitionVersion) return true;
    return false;
  });
}

async function ensurePeriodForInstant(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  occurredAt: Date,
  now: Date,
) {
  if (occurredAt > now) return null;
  const calendar = currentCalendarPeriod(
    occurredAt,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  );
  if (calendar.end && goal.activationAt >= calendar.end) return null;
  const close = creditClosesAt(calendar.end, goal.timeZone);
  if (close && now >= close) return null;
  return insertPeriodIfMissing(transaction, goal, calendar, now);
}

async function ensurePeriod(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  now: Date,
): Promise<PeriodRow> {
  const calendar = currentCalendarPeriod(
    now,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  );
  const inserted = await insertPeriodIfMissing(transaction, goal, calendar, now);
  if (!inserted) throw new Error("Goal period could not be created");
  return inserted;
}

async function insertPeriodIfMissing(
  transaction: DatabaseTransaction,
  goal: GoalRow,
  calendar: { key: string; start: Date; end: Date | null },
  now: Date,
) {
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
  const eligibleStart = goal.activationAt > calendar.start ? goal.activationAt : calendar.start;
  const [inserted] = await transaction
    .insert(schema.goalPeriods)
    .values({
      id: randomUUID(),
      goalId: goal.id,
      userId: goal.userId,
      definitionVersion: goal.definitionVersion,
      periodKey: calendar.key,
      periodStart: calendar.start,
      periodEnd: calendar.end,
      eligibleStart,
      activationAt: goal.activationAt,
      timeZone: goal.timeZone,
      kind: goal.kind,
      metric: goal.metric,
      sportFilter: goal.sportFilter,
      prKind: goal.prKind,
      prKey: goal.prKey,
      displayUnit: goal.displayUnit,
      targetValue: goal.targetValue,
      creditClosesAt: creditClosesAt(calendar.end, goal.timeZone),
      state: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted ?? null;
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
        .where(and(
          eq(schema.goalPeriods.goalId, goal.id),
          eq(schema.goalPeriods.definitionVersion, goal.definitionVersion),
          eq(schema.goalPeriods.state, "reached"),
        ))
        .limit(1);
      if (period) continue;
      await transaction
        .update(schema.goals)
        .set({ state: "expired", activeSlot: null, updatedAt: now })
        .where(and(eq(schema.goals.id, goal.id), eq(schema.goals.state, "active")));
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

async function lockGoalForUser(
  transaction: DatabaseTransaction,
  userId: string,
  goalId: string,
) {
  const [goal] = await transaction
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)))
    .limit(1)
    .for("update");
  return goal ?? null;
}

async function loadEligibleSnapshots(
  transaction: Queryable,
  definition: GoalDefinition & { userId: string },
  period: GoalPeriodWindow,
  now: Date,
  archiveCutoff?: Date,
) {
  const filters = [
    eq(schema.workoutSessions.userId, definition.userId),
    sql`${schema.workoutSessions.createdAt} > ${definition.activationAt}`,
    gte(schema.workoutSessions.occurredAt, period.eligibleStart),
    lte(schema.workoutSessions.occurredAt, now),
  ];
  if (period.periodEnd) filters.push(sql`${schema.workoutSessions.occurredAt} < ${period.periodEnd}`);
  if (period.creditClosesAt) {
    filters.push(sql`${schema.workoutSessions.createdAt} < ${period.creditClosesAt}`);
  }
  if (archiveCutoff) {
    filters.push(lte(schema.workoutSessions.createdAt, archiveCutoff));
    filters.push(lte(schema.workoutSessions.occurredAt, archiveCutoff));
  }
  if (definition.sportFilter) {
    filters.push(eq(schema.workoutSessions.workoutType, definition.sportFilter));
  }
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
  const currentVersion = periods.filter((period) => period.definitionVersion === goal.definitionVersion);
  const reachedPeriod = current?.state === "reached"
    ? current
    : goal.state === "active"
      ? null
      : currentVersion.find((period) => period.state === "reached") ?? null;
  const origin = reachedPeriod?.completionMethod === "auto" && reachedPeriod.originatingPostId && reachedPeriod.sourceSessionId
    ? await loadAuthorizedOriginPost(database, {
      originatingPostId: reachedPeriod.originatingPostId,
      sessionId: reachedPeriod.sourceSessionId,
      userId: goal.userId,
    })
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
    shareable: Boolean(origin),
    shareCrewName: origin?.crewName ?? null,
    sourceSessionId: reachedPeriod?.sourceSessionId ?? null,
    sourceGroupId: origin?.groupId ?? null,
    currentPeriodId: current?.id ?? null,
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
  const snapshots = await loadEligibleSnapshots(
    database,
    period ? asPeriodDefinition(period) : asDefinition(goal),
    window,
    now,
  );
  const periodLabel = formatPeriodLabel(goal, window);
  if (goal.kind === "volume") {
    const { total } = accumulateVolume(
      { metric: goal.metric as GoalDefinition["metric"], targetValue: goal.targetValue },
      snapshots,
    );
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
  const best = bestValue(period ? asPeriodDefinition(period) : asDefinition(goal), snapshots);
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

function accumulateVolume(
  goal: Pick<GoalDefinition, "metric" | "targetValue">,
  snapshots: GoalSessionSnapshot[],
) {
  let total = 0;
  let source: GoalSessionSnapshot | null = null;
  for (const snapshot of [...snapshots].sort(byOccurrence)) {
    const contribution = sessionVolumeContribution(snapshot, goal.metric);
    if (contribution == null) continue;
    total += contribution;
    if (!source && total >= goal.targetValue) source = snapshot;
  }
  return { total, source };
}

function bestValue(definition: GoalDefinition, snapshots: GoalSessionSnapshot[]) {
  let best: number | null = null;
  for (const snapshot of snapshots) {
    const candidate = definition.kind === "time"
      ? qualifyingTimeCandidate(snapshot, definition)
        ?? extractGoalPerformanceCandidates(snapshot).find((item) => item.key === definition.prKey)
      : qualifyingLiftCandidate(snapshot, definition)
        ?? extractGoalPerformanceCandidates(snapshot).find((item) => item.key === definition.prKey);
    if (!candidate) continue;
    const value = definition.kind === "time" ? candidate.metric.durationSeconds : candidate.metric.loadKg;
    if (value == null) continue;
    if (best == null) {
      best = value;
      continue;
    }
    if (definition.kind === "time" && value < best) best = value;
    if (definition.kind === "lift" && value > best) best = value;
  }
  return best;
}

function progressRatio(goal: GoalRow, best: number | null) {
  if (best == null || best <= 0) return 0;
  if (goal.kind === "time") {
    if (best >= goal.targetValue) return Math.min(0.99, goal.targetValue / best);
    return 1;
  }
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

function asDefinition(goal: GoalRow): GoalDefinition & { userId: string } {
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
    userId: goal.userId,
  };
}

function asPeriodDefinition(period: PeriodRow): GoalDefinition & { userId: string } {
  return {
    activationAt: period.activationAt,
    displayUnit: period.displayUnit,
    kind: period.kind as GoalDefinition["kind"],
    metric: period.metric as GoalDefinition["metric"],
    prKey: period.prKey,
    prKind: period.prKind,
    sportFilter: period.sportFilter,
    targetValue: period.targetValue,
    timeZone: period.timeZone,
    userId: period.userId,
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

function pickCurrentPeriod(goal: GoalRow, periods: PeriodRow[], now: Date) {
  const calendar = currentCalendarPeriod(
    now,
    goal.timeZone,
    goal.schedule as "weekly" | "monthly" | "one_time",
    goal.deadlineAt,
  );
  return periods.find((period) => (
    period.periodKey === calendar.key && period.definitionVersion === goal.definitionVersion
  )) ?? null;
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

async function loadAuthorizedOriginPost(
  database: Queryable,
  input: {
    userId: string;
    sessionId: string;
    originatingPostId: string;
    groupId?: string;
  },
) {
  const filters = [
    eq(schema.communityPosts.id, input.originatingPostId),
    eq(schema.communityPosts.workoutSessionId, input.sessionId),
    eq(schema.communityPosts.userId, input.userId),
    isNull(schema.communityPosts.removedAt),
    eq(schema.groupMembers.userId, input.userId),
    activeMembership,
    openGroup,
    crewAuthorVisibleSql(
      schema.communityPosts.groupId,
      schema.communityPosts.userId,
      schema.communityPosts.createdAt,
    ),
  ];
  if (input.groupId) filters.push(eq(schema.communityPosts.groupId, input.groupId));
  const [post] = await database
    .select({
      communityPostId: schema.communityPosts.id,
      crewName: schema.groups.name,
      groupId: schema.communityPosts.groupId,
      postUserId: schema.communityPosts.userId,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.communityPosts.groupId, schema.groups.id))
    .innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.communityPosts.groupId))
    .where(and(...filters))
    .limit(1);
  return post ?? null;
}

async function loadAuthorizedSessionPost(
  database: Queryable,
  input: {
    userId: string;
    sessionId: string;
    groupId: string;
  },
) {
  const [post] = await database
    .select({
      communityPostId: schema.communityPosts.id,
      crewName: schema.groups.name,
      groupId: schema.communityPosts.groupId,
      postUserId: schema.communityPosts.userId,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.communityPosts.groupId, schema.groups.id))
    .innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.communityPosts.groupId))
    .where(and(
      eq(schema.communityPosts.workoutSessionId, input.sessionId),
      eq(schema.communityPosts.groupId, input.groupId),
      eq(schema.communityPosts.userId, input.userId),
      isNull(schema.communityPosts.removedAt),
      eq(schema.groupMembers.userId, input.userId),
      activeMembership,
      openGroup,
      crewAuthorVisibleSql(
        schema.communityPosts.groupId,
        schema.communityPosts.userId,
        schema.communityPosts.createdAt,
      ),
    ))
    .limit(1);
  return post ?? null;
}

async function settleUserGoalReads(userId: string, now: Date) {
  await getDatabase().transaction(async (transaction) => {
    await lockUser(transaction, userId);
    await settleExpiredGoals(transaction, userId, now);
  });
}

function resolveUpdatedDeadline(
  input: Date | string | null | undefined,
  goal: GoalRow,
) {
  if (input == null || input === "") return null;
  if (goal.deadlineAt && input instanceof Date && input.getTime() === goal.deadlineAt.getTime()) {
    return goal.deadlineAt;
  }
  if (goal.deadlineAt && typeof input === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const parsed = new Date(input);
    if (parsed.getTime() === goal.deadlineAt.getTime()) return goal.deadlineAt;
  }
  const next = exclusiveDeadlineFromInput(input, goal.timeZone);
  if (goal.deadlineAt && next.getTime() === goal.deadlineAt.getTime()) return goal.deadlineAt;
  const existingInclusive = goal.deadlineAt
    ? addZonedDays(goal.deadlineAt, -1, goal.timeZone)
    : null;
  if (existingInclusive && typeof input === "string") {
    const existingYmd = zonedParts(existingInclusive, goal.timeZone);
    const ymd = `${existingYmd.year}-${String(existingYmd.month).padStart(2, "0")}-${String(existingYmd.day).padStart(2, "0")}`;
    if (input === ymd || input.startsWith(ymd)) return goal.deadlineAt;
  }
  return next;
}

function nextDeadlineAfterReopen(
  goal: GoalRow,
  now: Date,
  requested?: Date | string | null,
) {
  if (requested != null && requested !== "") {
    const exclusive = exclusiveDeadlineFromInput(requested, goal.timeZone);
    if (exclusive <= now) throw new GoalRequestError(GOAL_REOPEN_DEADLINE_MESSAGE);
    return exclusive;
  }
  if (!goal.deadlineAt) return null;
  if (goal.deadlineAt > now) return goal.deadlineAt;
  if (goal.kind !== "volume") return null;
  const lastInclusive = addZonedDays(goal.deadlineAt, -1, goal.timeZone);
  const originalStart = startOfZonedDay(goal.startsAt, goal.timeZone);
  const span = Math.max(zonedDayDiff(originalStart, lastInclusive, goal.timeZone), 0);
  const newLast = addZonedDays(startOfZonedDay(now, goal.timeZone), span, goal.timeZone);
  const exclusive = addZonedDays(newLast, 1, goal.timeZone);
  if (exclusive <= now) {
    return addZonedDays(startOfZonedDay(now, goal.timeZone), 1, goal.timeZone);
  }
  return exclusive;
}

export { loadSnapshots as loadGoalSessionSnapshots };
export { startOfZonedDay };
