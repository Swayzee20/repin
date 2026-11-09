import "server-only";

// Backfill is lazy per user/key: the first time a key is seen, remaining
// history (excluding the current session) is scanned. If history exists, the
// earliest best is stored as source=backfill, baseline_only, celebrated=false.
// That write is idempotent via the (user_id, kind, key) unique row. Backfilled
// baselines never celebrate or badge. There is no one-time job.

import { randomUUID } from "node:crypto";

import type {
  DetectedPr,
  PersonalRecordKind,
  PrBadge,
  PrDetectionResult,
  PrPrompt,
} from "@repin/types";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import {
  decidePrAction,
  extractPrCandidates,
  formatPrDelta,
  pickBaselineCandidate,
  type PrCandidate,
  type PrMetric,
  type PrSessionSnapshot,
} from "./pr-detection";
import * as schema from "./schema";

type Queryable = Database | DatabaseTransaction;

export type PrKeyRef = { kind: PersonalRecordKind; key: string };

export async function detectPersonalRecordsForSession(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  transaction?: DatabaseTransaction;
}): Promise<PrDetectionResult> {
  const run = async (transaction: DatabaseTransaction) => {
    const snapshot = await loadSessionSnapshot(transaction, input.sessionId);
    if (!snapshot || snapshot.userId !== input.userId) {
      return emptyDetection();
    }
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    return evaluateSession(transaction, snapshot, share);
  };

  if (input.transaction) return run(input.transaction);
  return getDatabase().transaction(run);
}

export async function recomputePersonalRecordsForSession(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  previousKeys: PrKeyRef[];
  transaction?: DatabaseTransaction;
}): Promise<PrDetectionResult> {
  const run = async (transaction: DatabaseTransaction) => {
    const snapshot = await loadSessionSnapshot(transaction, input.sessionId);
    if (!snapshot || snapshot.userId !== input.userId) {
      await recomputeKeys(transaction, input.userId, input.previousKeys);
      await dropUnqualifiedBadgesForSession(transaction, input.userId, input.sessionId);
      return emptyDetection();
    }
    const currentKeys = extractPrCandidates(snapshot).map((candidate) => ({
      kind: candidate.kind,
      key: candidate.key,
    }));
    const goneKeys = input.previousKeys.filter((previous) =>
      !currentKeys.some((current) => current.kind === previous.kind && current.key === previous.key));
    await recomputeKeys(transaction, input.userId, goneKeys);
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    const detection = await evaluateSession(transaction, snapshot, share);
    await dropUnqualifiedBadgesForSession(transaction, input.userId, input.sessionId);
    return detection;
  };

  if (input.transaction) return run(input.transaction);
  return getDatabase().transaction(run);
}

export async function recomputePersonalRecordsAfterDelete(input: {
  userId: string;
  keys: PrKeyRef[];
  transaction?: DatabaseTransaction;
}) {
  const run = async (transaction: DatabaseTransaction) => {
    await recomputeKeys(transaction, input.userId, input.keys);
  };
  if (input.transaction) return run(input.transaction);
  return getDatabase().transaction(run);
}

export async function collectSessionPrKeys(
  sessionId: string,
  transaction?: Queryable,
): Promise<PrKeyRef[]> {
  const database = transaction ?? getDatabase();
  const snapshot = await loadSessionSnapshot(database, sessionId);
  if (!snapshot) return [];
  return extractPrCandidates(snapshot).map((candidate) => ({
    kind: candidate.kind,
    key: candidate.key,
  }));
}

export async function answerPersonalRecordPrompts(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  answers: Array<{ kind: PersonalRecordKind; key: string; confirmed: boolean }>;
}): Promise<PrDetectionResult> {
  return getDatabase().transaction(async (transaction) => {
    const snapshot = await loadSessionSnapshot(transaction, input.sessionId);
    if (!snapshot || snapshot.userId !== input.userId) return emptyDetection();
    const candidates = extractPrCandidates(snapshot);
    const detected: DetectedPr[] = [];
    const remaining: PrPrompt[] = [];

    for (const candidate of candidates) {
      if (candidate.promptKind == null) continue;
      const answer = input.answers.find((item) =>
        item.kind === candidate.kind && item.key === candidate.key);
      if (!answer) {
        const existing = await loadRecord(transaction, input.userId, candidate.kind, candidate.key);
        if (!existing) remaining.push(toPrompt(candidate));
        continue;
      }
      const existing = await loadRecord(transaction, input.userId, candidate.kind, candidate.key);
      const previous = existing ? metricFromRow(existing) : null;
      await upsertRecord(transaction, input.userId, candidate, {
        baselineOnly: !answer.confirmed,
        celebrated: answer.confirmed,
        source: "logged",
      });
      if (answer.confirmed) {
        detected.push(toDetected(candidate, previous, false));
      }
    }

    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    return {
      crewName: share.crewName,
      communityPostId: share.communityPostId,
      detected,
      prompts: remaining,
    };
  });
}

export async function shareSessionPersonalRecords(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  keys?: PrKeyRef[];
}): Promise<PrBadge[]> {
  return getDatabase().transaction(async (transaction) => {
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    if (!share.communityPostId || share.postUserId !== input.userId) return [];

    const records = await transaction
      .select()
      .from(schema.personalRecords)
      .where(and(
        eq(schema.personalRecords.userId, input.userId),
        eq(schema.personalRecords.sourceSessionId, input.sessionId),
        eq(schema.personalRecords.celebrated, true),
        eq(schema.personalRecords.baselineOnly, false),
      ));

    const selected = records.filter((record) => {
      if (!input.keys?.length) return true;
      return input.keys.some((item) => item.kind === record.kind && item.key === record.key);
    });

    const badges: PrBadge[] = [];
    for (const record of selected) {
      await transaction
        .delete(schema.communityPostPrs)
        .where(and(
          eq(schema.communityPostPrs.userId, input.userId),
          eq(schema.communityPostPrs.kind, record.kind),
          eq(schema.communityPostPrs.key, record.key),
        ));
      const [inserted] = await transaction
        .insert(schema.communityPostPrs)
        .values({
          id: randomUUID(),
          postId: share.communityPostId,
          userId: input.userId,
          kind: record.kind,
          key: record.key,
          metricLoadKg: record.metricLoadKg,
          metricDurationSeconds: record.metricDurationSeconds,
          metricRounds: record.metricRounds,
          metricReps: record.metricReps,
          metricFinished: record.metricFinished,
          displayLabel: record.displayLabel,
          displayValue: record.displayValue,
          sourceSessionId: input.sessionId,
        })
        .returning();
      if (inserted) badges.push(toBadge(inserted));
    }
    return badges;
  });
}

export async function removeCommunityPostPrBadges(input: {
  userId: string;
  sessionId: string;
  groupId: string;
}): Promise<PrBadge[]> {
  return getDatabase().transaction(async (transaction) => {
    const share = await loadShareContext(transaction, input.sessionId, input.groupId);
    if (!share.communityPostId || share.postUserId !== input.userId) return [];
    const existing = await transaction
      .select()
      .from(schema.communityPostPrs)
      .where(and(
        eq(schema.communityPostPrs.postId, share.communityPostId),
        eq(schema.communityPostPrs.userId, input.userId),
      ));
    if (!existing.length) return [];
    await transaction
      .delete(schema.communityPostPrs)
      .where(and(
        eq(schema.communityPostPrs.postId, share.communityPostId),
        eq(schema.communityPostPrs.userId, input.userId),
      ));
    return [];
  });
}

export async function restoreCommunityPostPrBadges(input: {
  userId: string;
  sessionId: string;
  groupId: string;
  badges: PrKeyRef[];
}): Promise<PrBadge[]> {
  return shareSessionPersonalRecords({
    userId: input.userId,
    sessionId: input.sessionId,
    groupId: input.groupId,
    keys: input.badges,
  });
}

export async function listPrBadgesForPosts(postIds: string[]) {
  if (!postIds.length) return new Map<string, PrBadge[]>();
  const rows = await getDatabase()
    .select()
    .from(schema.communityPostPrs)
    .where(inArray(schema.communityPostPrs.postId, postIds))
    .orderBy(asc(schema.communityPostPrs.createdAt), asc(schema.communityPostPrs.id));

  const badges = new Map<string, PrBadge[]>();
  for (const row of rows) {
    const list = badges.get(row.postId) ?? [];
    list.push(toBadge(row));
    badges.set(row.postId, list);
  }
  return badges;
}

export async function loadSessionSnapshot(
  database: Queryable,
  sessionId: string,
): Promise<PrSessionSnapshot | null> {
  const [session] = await database
    .select()
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  const [metrics, movements] = await Promise.all([
    database
      .select()
      .from(schema.workoutSessionMetrics)
      .where(eq(schema.workoutSessionMetrics.workoutSessionId, sessionId))
      .orderBy(asc(schema.workoutSessionMetrics.position)),
    database
      .select()
      .from(schema.sessionMovementResults)
      .where(eq(schema.sessionMovementResults.workoutSessionId, sessionId))
      .orderBy(asc(schema.sessionMovementResults.position)),
  ]);

  const sets = movements.length
    ? await database
        .select()
        .from(schema.setResults)
        .where(inArray(
          schema.setResults.sessionMovementResultId,
          movements.map((movement) => movement.id),
        ))
        .orderBy(asc(schema.setResults.sessionMovementResultId), asc(schema.setResults.position))
    : [];

  return {
    id: session.id,
    userId: session.userId,
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
    metrics,
    movements: movements.map((movement) => ({
      id: movement.id,
      movementId: movement.movementId,
      movementName: movement.movementName,
      position: movement.position,
      sets: sets.filter((set) => set.sessionMovementResultId === movement.id),
    })),
  };
}

async function evaluateSession(
  transaction: DatabaseTransaction,
  snapshot: PrSessionSnapshot,
  share: { communityPostId: string | null; crewName: string | null },
): Promise<PrDetectionResult> {
  const candidates = extractPrCandidates(snapshot);
  const prompts: PrPrompt[] = [];
  const detected: DetectedPr[] = [];

  for (const candidate of candidates) {
    const existing = await loadRecord(
      transaction,
      snapshot.userId,
      candidate.kind,
      candidate.key,
    );
    let baseline = existing ? metricFromRow(existing) : null;

    if (!existing) {
      const historical = await loadHistoricalBest(
        transaction,
        snapshot.userId,
        candidate,
        snapshot.id,
      );
      if (historical) {
        await upsertRecord(transaction, snapshot.userId, historical, {
          baselineOnly: true,
          celebrated: false,
          source: "backfill",
        });
        baseline = historical.metric;
      }
    }

    const decision = decidePrAction(candidate, baseline);
    if (decision.action === "prompt") {
      prompts.push(toPrompt(candidate));
      continue;
    }
    if (decision.action === "quiet_baseline") {
      await upsertRecord(transaction, snapshot.userId, candidate, {
        baselineOnly: true,
        celebrated: false,
        source: "logged",
      });
      continue;
    }
    if (decision.action === "auto_pr") {
      await upsertRecord(transaction, snapshot.userId, candidate, {
        baselineOnly: false,
        celebrated: true,
        source: "logged",
      });
      detected.push(toDetected(candidate, decision.previous, true));
      continue;
    }

    if (existing?.sourceSessionId === snapshot.id) {
      const others = await loadHistoricalCandidates(
        transaction,
        snapshot.userId,
        candidate.kind,
        candidate.key,
        snapshot.id,
      );
      const best = pickBaselineCandidate([...others, candidate]);
      if (best && best.sourceSessionId === snapshot.id) {
        await upsertRecord(transaction, snapshot.userId, candidate, {
          baselineOnly: existing.baselineOnly,
          celebrated: existing.celebrated,
          source: existing.source === "backfill" ? "backfill" : "logged",
        });
      } else if (best) {
        await upsertRecord(transaction, snapshot.userId, best, {
          baselineOnly: true,
          celebrated: false,
          source: "logged",
        });
      } else {
        await transaction
          .delete(schema.personalRecords)
          .where(and(
            eq(schema.personalRecords.userId, snapshot.userId),
            eq(schema.personalRecords.kind, candidate.kind),
            eq(schema.personalRecords.key, candidate.key),
          ));
      }
    }
  }

  return {
    crewName: share.crewName,
    communityPostId: share.communityPostId,
    detected,
    prompts,
  };
}

async function recomputeKeys(
  transaction: DatabaseTransaction,
  userId: string,
  keys: PrKeyRef[],
) {
  const unique = uniqueKeys(keys);
  for (const item of unique) {
    const candidates = await loadHistoricalCandidates(
      transaction,
      userId,
      item.kind,
      item.key,
      null,
    );
    const best = pickBaselineCandidate(candidates);
    if (!best) {
      await transaction
        .delete(schema.personalRecords)
        .where(and(
          eq(schema.personalRecords.userId, userId),
          eq(schema.personalRecords.kind, item.kind),
          eq(schema.personalRecords.key, item.key),
        ));
      await transaction
        .delete(schema.communityPostPrs)
        .where(and(
          eq(schema.communityPostPrs.userId, userId),
          eq(schema.communityPostPrs.kind, item.kind),
          eq(schema.communityPostPrs.key, item.key),
        ));
      continue;
    }
    const existing = await loadRecord(transaction, userId, item.kind, item.key);
    await upsertRecord(transaction, userId, best, {
      baselineOnly: existing?.sourceSessionId === best.sourceSessionId
        ? existing.baselineOnly
        : true,
      celebrated: existing?.sourceSessionId === best.sourceSessionId
        ? existing.celebrated
        : false,
      source: existing?.source === "backfill" && existing.sourceSessionId === best.sourceSessionId
        ? "backfill"
        : "logged",
    });
    // A newer unshared result must not pull an older shared badge off its post.
    // Badges on the session being edited/deleted are dropped in
    // dropUnqualifiedBadgesForSession (or CASCADE on post delete).
  }
}

async function dropUnqualifiedBadgesForSession(
  transaction: DatabaseTransaction,
  userId: string,
  sessionId: string,
) {
  const share = await transaction
    .select({
      id: schema.communityPosts.id,
    })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.workoutSessionId, sessionId),
      eq(schema.communityPosts.userId, userId),
    ));
  if (!share.length) return;

  const snapshot = await loadSessionSnapshot(transaction, sessionId);
  const qualifying = new Set(
    snapshot
      ? extractPrCandidates(snapshot).map((candidate) => `${candidate.kind}:${candidate.key}`)
      : [],
  );
  const records = snapshot
    ? await transaction
        .select()
        .from(schema.personalRecords)
        .where(and(
          eq(schema.personalRecords.userId, userId),
          eq(schema.personalRecords.sourceSessionId, sessionId),
          eq(schema.personalRecords.celebrated, true),
        ))
    : [];
  const stillBest = new Set(records.map((record) => `${record.kind}:${record.key}`));

  for (const post of share) {
    const badges = await transaction
      .select()
      .from(schema.communityPostPrs)
      .where(eq(schema.communityPostPrs.postId, post.id));
    for (const badge of badges) {
      const stamp = `${badge.kind}:${badge.key}`;
      if (!qualifying.has(stamp) || !stillBest.has(stamp)) {
        await transaction
          .delete(schema.communityPostPrs)
          .where(eq(schema.communityPostPrs.id, badge.id));
      }
    }
  }
}

async function loadHistoricalBest(
  transaction: DatabaseTransaction,
  userId: string,
  candidate: PrCandidate,
  excludeSessionId: string,
) {
  const others = await loadHistoricalCandidates(
    transaction,
    userId,
    candidate.kind,
    candidate.key,
    excludeSessionId,
  );
  return pickBaselineCandidate(others);
}

async function loadHistoricalCandidates(
  transaction: DatabaseTransaction,
  userId: string,
  kind: PersonalRecordKind,
  key: string,
  excludeSessionId: string | null,
) {
  const snapshots = await loadHistorySnapshots(transaction, userId, kind, excludeSessionId);
  return snapshots.flatMap(extractPrCandidates).filter((candidate) =>
    candidate.kind === kind && candidate.key === key);
}

async function loadHistorySnapshots(
  transaction: DatabaseTransaction,
  userId: string,
  kind: PersonalRecordKind,
  excludeSessionId: string | null,
): Promise<PrSessionSnapshot[]> {
  const sessions = await transaction
    .select()
    .from(schema.workoutSessions)
    .where(and(
      eq(schema.workoutSessions.userId, userId),
      excludeSessionId ? ne(schema.workoutSessions.id, excludeSessionId) : undefined,
      historyKindFilter(kind),
    ))
    .orderBy(asc(schema.workoutSessions.occurredAt));
  if (!sessions.length) return [];

  const sessionIds = sessions.map((session) => session.id);
  const [metrics, movements] = await Promise.all([
    kind === "distance_time"
      ? transaction
          .select()
          .from(schema.workoutSessionMetrics)
          .where(inArray(schema.workoutSessionMetrics.workoutSessionId, sessionIds))
      : Promise.resolve([]),
    kind === "heaviest_single" || kind === "amrap" || kind === "for_time"
      ? transaction
          .select()
          .from(schema.sessionMovementResults)
          .where(inArray(schema.sessionMovementResults.workoutSessionId, sessionIds))
          .orderBy(
            asc(schema.sessionMovementResults.workoutSessionId),
            asc(schema.sessionMovementResults.position),
          )
      : Promise.resolve([]),
  ]);
  const sets = movements.length
    ? await transaction
        .select()
        .from(schema.setResults)
        .where(inArray(
          schema.setResults.sessionMovementResultId,
          movements.map((movement) => movement.id),
        ))
        .orderBy(asc(schema.setResults.sessionMovementResultId), asc(schema.setResults.position))
    : [];

  return sessions.map((session) => ({
    id: session.id,
    userId: session.userId,
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
    metrics: metrics.filter((metric) => metric.workoutSessionId === session.id),
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

function historyKindFilter(kind: PersonalRecordKind) {
  switch (kind) {
    case "heaviest_single":
      return inArray(schema.workoutSessions.workoutType, [
        "strength_training",
        "powerlifting",
      ]);
    case "distance_time":
      return inArray(schema.workoutSessions.workoutType, ["run", "walk", "cycling"]);
    case "amrap":
      return eq(schema.workoutSessions.workoutFormat, "amrap");
    case "for_time":
      return eq(schema.workoutSessions.workoutFormat, "for_time");
  }
}

async function loadShareContext(
  database: Queryable,
  sessionId: string,
  groupId: string,
) {
  const [post] = await database
    .select({
      id: schema.communityPosts.id,
      userId: schema.communityPosts.userId,
      name: schema.groups.name,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
    .where(and(
      eq(schema.communityPosts.workoutSessionId, sessionId),
      eq(schema.communityPosts.groupId, groupId),
      sql`${schema.communityPosts.removedAt} is null`,
    ))
    .limit(1);
  return {
    communityPostId: post?.id ?? null,
    crewName: post?.name ?? null,
    postUserId: post?.userId ?? null,
  };
}

async function loadRecord(
  database: Queryable,
  userId: string,
  kind: PersonalRecordKind,
  key: string,
) {
  const [row] = await database
    .select()
    .from(schema.personalRecords)
    .where(and(
      eq(schema.personalRecords.userId, userId),
      eq(schema.personalRecords.kind, kind),
      eq(schema.personalRecords.key, key),
    ))
    .limit(1);
  return row ?? null;
}

async function upsertRecord(
  transaction: DatabaseTransaction,
  userId: string,
  candidate: PrCandidate,
  flags: {
    baselineOnly: boolean;
    celebrated: boolean;
    source: "logged" | "backfill";
  },
) {
  const now = new Date();
  await transaction
    .insert(schema.personalRecords)
    .values({
      id: randomUUID(),
      userId,
      kind: candidate.kind,
      key: candidate.key,
      metricLoadKg: candidate.metric.loadKg,
      metricDurationSeconds: candidate.metric.durationSeconds,
      metricRounds: candidate.metric.rounds,
      metricReps: candidate.metric.reps,
      metricFinished: candidate.metric.finished,
      displayUnit: candidate.displayUnit,
      displayLabel: candidate.displayLabel,
      displayValue: candidate.displayValue,
      source: flags.source,
      baselineOnly: flags.baselineOnly,
      celebrated: flags.celebrated,
      sourceSessionId: candidate.sourceSessionId,
      sourceSetId: candidate.sourceSetId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.personalRecords.userId,
        schema.personalRecords.kind,
        schema.personalRecords.key,
      ],
      set: {
        metricLoadKg: candidate.metric.loadKg,
        metricDurationSeconds: candidate.metric.durationSeconds,
        metricRounds: candidate.metric.rounds,
        metricReps: candidate.metric.reps,
        metricFinished: candidate.metric.finished,
        displayUnit: candidate.displayUnit,
        displayLabel: candidate.displayLabel,
        displayValue: candidate.displayValue,
        source: flags.source,
        baselineOnly: flags.baselineOnly,
        celebrated: flags.celebrated,
        sourceSessionId: candidate.sourceSessionId,
        sourceSetId: candidate.sourceSetId,
        updatedAt: now,
      },
    });
}

function metricFromRow(row: typeof schema.personalRecords.$inferSelect): PrMetric {
  return {
    durationSeconds: row.metricDurationSeconds,
    finished: row.metricFinished,
    loadKg: row.metricLoadKg,
    reps: row.metricReps,
    rounds: row.metricRounds,
  };
}

function toPrompt(candidate: PrCandidate): PrPrompt {
  return {
    intro: candidate.promptKind === "for_time" ? "for_time" : "one_rep",
    key: candidate.key,
    kind: candidate.kind,
    resultLine: candidate.displayValue,
    title: candidate.displayLabel,
  };
}

function toDetected(
  candidate: PrCandidate,
  previous: PrMetric | null,
  autoDetected: boolean,
): DetectedPr {
  return {
    autoDetected,
    delta: previous
      ? formatPrDelta(candidate.kind, candidate.metric, previous, candidate.displayUnit)
      : null,
    key: candidate.key,
    kind: candidate.kind,
    label: candidate.displayLabel,
    value: candidate.displayValue,
  };
}

function toBadge(row: typeof schema.communityPostPrs.$inferSelect): PrBadge {
  return {
    id: row.id,
    key: row.key,
    kind: row.kind as PersonalRecordKind,
    label: row.displayLabel,
    value: row.displayValue,
  };
}

function emptyDetection(): PrDetectionResult {
  return {
    communityPostId: null,
    crewName: null,
    detected: [],
    prompts: [],
  };
}

function uniqueKeys(keys: PrKeyRef[]) {
  const seen = new Set<string>();
  const unique: PrKeyRef[] = [];
  for (const key of keys) {
    const stamp = `${key.kind}:${key.key}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    unique.push(key);
  }
  return unique;
}
