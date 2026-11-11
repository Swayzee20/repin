import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { workoutTypesWithFeedMetrics, type WorkoutFormat } from "@repin/types";
import { columnsToFormat } from "@repin/validation";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  lt,
  ne,
  sql,
} from "drizzle-orm";

import {
  checkDatabaseConnection,
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import {
  dismissOpenReportsForComment,
  dismissOpenReportsForCommunityPost,
  visibleCommentCountSql,
  visibleReactionCountSql,
} from "./moderation";
import {
  activeMembership,
  openGroup,
  viewerActiveMembership,
} from "./membership";
import * as schema from "./schema";
import {
  communityCommentVisibleToSql,
  communityPostVisibleToSql,
  communityReactionVisibleToSql,
  isCreatorAuthorizedDefinitionVisibleTo,
} from "./visibility";
import {
  deriveLogVersion,
  derivedDisplayMetrics,
} from "./workout-format-display";
import {
  formatWorkoutResultSummary,
  type WorkoutResultMovement,
} from "./workout-result-summary";
import {
  collectSessionPrKeys,
  detectPersonalRecordsForSession,
  listPrBadgesForPosts,
  recomputePersonalRecordsAfterDelete,
  recomputePersonalRecordsForSession,
} from "./personal-records";
import {
  evaluateGoalsForSession,
  listGoalBadgesForPosts,
  lockUserGoals,
  recomputeGoalsForUser,
} from "./goals";

export { checkDatabaseConnection, getDatabase };
export {
  communityCommentVisibleTo,
  communityCommentVisibleToSql,
  communityPostVisibleTo,
  communityPostVisibleToSql,
  communityReactionVisibleTo,
  communityReactionVisibleToSql,
  creatorAuthorizedDefinitionSql,
  isCreatorAuthorizedDefinitionVisibleTo,
  isWorkoutSessionVisibleTo,
  workoutSessionVisibleToSql,
} from "./visibility";

export class WorkoutRequestError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "WorkoutRequestError";
  }
}

export async function getOrCreateUser(input: {
  id: string;
  displayName: string;
}) {
  const database = getDatabase();
  const [existingUser] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, input.id))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  const [createdUser] = await database
    .insert(schema.users)
    .values(input)
    .onConflictDoNothing({ target: schema.users.id })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  // Another request may have provisioned the same authenticated user after
  // the read above. Resolve that canonical row instead of failing the request.
  const [concurrentlyCreatedUser] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, input.id))
    .limit(1);

  if (!concurrentlyCreatedUser) {
    throw new Error("Application user could not be loaded");
  }

  return concurrentlyCreatedUser;
}

export async function createMovement(input: {
  name: string;
  slug: string;
  category?: string | null;
  equipment?: string | null;
}) {
  const [movement] = await getDatabase()
    .insert(schema.movements)
    .values({
      name: input.name,
      slug: input.slug,
      category: input.category ?? null,
      equipment: input.equipment ?? null,
    })
    .returning();

  if (!movement) {
    throw new Error("Movement could not be created");
  }

  return movement;
}

export type WorkoutDefinitionSourceType =
  (typeof schema.workoutDefinitionSourceTypes)[number];
export type WorkoutBlockType = (typeof schema.workoutBlockTypes)[number];

export interface CreateBlockMovementInput {
  movementId?: string | null;
  movementName: string;
  position: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetSeconds?: number | null;
  targetDistance?: number | null;
  targetCalories?: number | null;
  targetLoad?: number | null;
  repType?: string | null;
  isShared?: boolean;
  participant?: string | null;
  notes?: string | null;
  config?: schema.WorkoutConfig | null;
}

export interface CreateWorkoutBlockInput {
  position: number;
  type: WorkoutBlockType;
  title?: string | null;
  rounds?: number | null;
  durationSeconds?: number | null;
  config?: schema.WorkoutConfig | null;
  movements: CreateBlockMovementInput[];
}

export async function createWorkoutDefinition(input: {
  createdByUserId?: string | null;
  title: string;
  description?: string | null;
  sourceType: WorkoutDefinitionSourceType;
  blocks: CreateWorkoutBlockInput[];
}) {
  return getDatabase().transaction(async (transaction) => {
    const [definition] = await transaction
      .insert(schema.workoutDefinitions)
      .values({
        createdByUserId: input.createdByUserId ?? null,
        title: input.title,
        description: input.description ?? null,
        sourceType: input.sourceType,
      })
      .returning();

    if (!definition) {
      throw new Error("Workout definition could not be created");
    }

    const blocks = [];
    for (const blockInput of input.blocks) {
      const [block] = await transaction
        .insert(schema.workoutBlocks)
        .values({
          workoutDefinitionId: definition.id,
          position: blockInput.position,
          type: blockInput.type,
          title: blockInput.title ?? null,
          rounds: blockInput.rounds ?? null,
          durationSeconds: blockInput.durationSeconds ?? null,
          config: blockInput.config ?? null,
        })
        .returning();

      if (!block) {
        throw new Error("Workout block could not be created");
      }

      const movements = blockInput.movements.length
        ? await transaction
            .insert(schema.blockMovements)
            .values(
              blockInput.movements.map((movement) => ({
                workoutBlockId: block.id,
                movementId: movement.movementId ?? null,
                movementName: movement.movementName,
                position: movement.position,
                targetSets: movement.targetSets ?? null,
                targetRepsMin: movement.targetRepsMin ?? null,
                targetRepsMax: movement.targetRepsMax ?? null,
                targetSeconds: movement.targetSeconds ?? null,
                targetDistance: movement.targetDistance ?? null,
                targetCalories: movement.targetCalories ?? null,
                targetLoad: movement.targetLoad ?? null,
                repType: movement.repType ?? null,
                isShared: movement.isShared ?? false,
                participant: movement.participant ?? null,
                notes: movement.notes ?? null,
                config: movement.config ?? null,
              })),
            )
            .returning()
        : [];

      blocks.push({ ...block, movements });
    }

    return { ...definition, blocks };
  });
}

/** Internal loader. Not an authorization boundary; do not expose unguarded. */
export async function getWorkoutDefinition(definitionId: string) {
  const database = getDatabase();
  const [definition] = await database
    .select()
    .from(schema.workoutDefinitions)
    .where(eq(schema.workoutDefinitions.id, definitionId))
    .limit(1);

  if (!definition) return null;

  const blocks = await database
    .select()
    .from(schema.workoutBlocks)
    .where(eq(schema.workoutBlocks.workoutDefinitionId, definitionId))
    .orderBy(asc(schema.workoutBlocks.position));

  const movements = blocks.length
    ? await database
        .select()
        .from(schema.blockMovements)
        .where(
          inArray(
            schema.blockMovements.workoutBlockId,
            blocks.map((block) => block.id),
          ),
        )
        .orderBy(
          asc(schema.blockMovements.workoutBlockId),
          asc(schema.blockMovements.position),
        )
    : [];

  return {
    ...definition,
    blocks: blocks.map((block) => ({
      ...block,
      movements: movements.filter(
        (movement) => movement.workoutBlockId === block.id,
      ),
    })),
  };
}

export async function getAuthorizedWorkoutDefinitionForViewer(input: {
  viewerId: string;
  definitionId: string;
}) {
  if (!(await isCreatorAuthorizedDefinitionVisibleTo(input.viewerId, input.definitionId))) {
    return null;
  }
  return getWorkoutDefinition(input.definitionId);
}

export type WorkoutSessionMetricType =
  (typeof schema.workoutSessionMetricTypes)[number];

export interface CreateWorkoutSessionMetricInput {
  position: number;
  metricType: WorkoutSessionMetricType;
  label?: string | null;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
}

export interface CreateWorkoutSessionSegmentInput {
  position: number;
  segmentType: (typeof schema.workoutSessionSegmentTypes)[number];
  distance?: number | null;
  distanceUnit?: (typeof schema.workoutDistanceUnits)[number] | null;
  durationSeconds?: number | null;
  recoverySeconds?: number | null;
  notes?: string | null;
  configuration?: schema.WorkoutConfig | null;
}

export interface CreateSetResultInput {
  position: number;
  reps?: number | null;
  load?: number | null;
  loadUnit?: string | null;
  durationSeconds?: number | null;
  distance?: number | null;
  distanceUnit?: string | null;
  calories?: number | null;
  completed?: boolean;
  notes?: string | null;
  config?: schema.WorkoutConfig | null;
}

export interface CreateSessionMovementResultInput {
  blockMovementId?: string | null;
  movementId?: string | null;
  movementName: string;
  position: number;
  notes?: string | null;
  config?: schema.WorkoutConfig | null;
  sets: CreateSetResultInput[];
}

export interface WorkoutFormatColumnInput {
  workoutFormat?: WorkoutFormat | null;
  formatDurationSeconds?: number | null;
  formatIntervalSeconds?: number | null;
  formatRounds?: number | null;
  timeCapSeconds?: number | null;
  scoreFinished?: boolean | null;
  scoreTimeSeconds?: number | null;
  scoreRounds?: number | null;
  scoreReps?: number | null;
}

export interface CreateWorkoutSessionWithResultsInput {
  session: {
    id?: string;
    userId: string;
    workoutDefinitionId?: string | null;
    workoutType: string;
    workoutSubtype?: (typeof schema.runWorkoutSubtypes)[number] | null;
    name?: string | null;
    durationMinutes?: number | null;
    effort?: number | null;
    occurredAt: Date;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  } & WorkoutFormatColumnInput;
  metrics?: CreateWorkoutSessionMetricInput[];
  movements?: CreateSessionMovementResultInput[];
  segments?: CreateWorkoutSessionSegmentInput[];
}

async function insertWorkoutSessionWithResults(
  transaction: DatabaseTransaction,
  input: CreateWorkoutSessionWithResultsInput,
) {
    const [session] = await transaction
      .insert(schema.workoutSessions)
      .values({
        id: input.session.id,
        userId: input.session.userId,
        workoutDefinitionId: input.session.workoutDefinitionId ?? null,
        workoutType: input.session.workoutType,
        workoutSubtype: input.session.workoutSubtype ?? null,
        workoutFormat: input.session.workoutFormat ?? null,
        formatDurationSeconds: input.session.formatDurationSeconds ?? null,
        formatIntervalSeconds: input.session.formatIntervalSeconds ?? null,
        formatRounds: input.session.formatRounds ?? null,
        timeCapSeconds: input.session.timeCapSeconds ?? null,
        scoreFinished: input.session.scoreFinished ?? null,
        scoreTimeSeconds: input.session.scoreTimeSeconds ?? null,
        scoreRounds: input.session.scoreRounds ?? null,
        scoreReps: input.session.scoreReps ?? null,
        name: input.session.name ?? null,
        durationMinutes: input.session.durationMinutes ?? null,
        effort: input.session.effort ?? null,
        occurredAt: input.session.occurredAt,
        notes: input.session.notes ?? null,
        createdAt: input.session.createdAt,
        updatedAt: input.session.updatedAt,
      })
      .returning();

    if (!session) {
      throw new Error("Workout session could not be created");
    }

    const movementInputs = input.movements ?? [];
    await assertKnownMovementIds(transaction, movementInputs);
    const prescribedMovementIds = movementInputs.flatMap((movement) =>
      movement.blockMovementId ? [movement.blockMovementId] : [],
    );

    if (prescribedMovementIds.length) {
      const prescribedMovements = await transaction
        .select({
          id: schema.blockMovements.id,
          workoutDefinitionId: schema.workoutBlocks.workoutDefinitionId,
        })
        .from(schema.blockMovements)
        .innerJoin(
          schema.workoutBlocks,
          eq(
            schema.blockMovements.workoutBlockId,
            schema.workoutBlocks.id,
          ),
        )
        .where(inArray(schema.blockMovements.id, prescribedMovementIds));
      const matchingIds = new Set(
        prescribedMovements
          .filter(
            (movement) =>
              movement.workoutDefinitionId === session.workoutDefinitionId,
          )
          .map((movement) => movement.id),
      );

      if (
        prescribedMovementIds.some(
          (movementId) => !matchingIds.has(movementId),
        )
      ) {
        throw new Error(
          "A prescribed movement does not belong to the session definition",
        );
      }
    }

    const metrics = input.metrics?.length
      ? await transaction
          .insert(schema.workoutSessionMetrics)
          .values(
            input.metrics.map((metric) => ({
              workoutSessionId: session.id,
              position: metric.position,
              metricType: metric.metricType,
              label: metric.label ?? null,
              numericValue: metric.numericValue ?? null,
              textValue: metric.textValue ?? null,
              unit: metric.unit ?? null,
            })),
          )
          .returning()
      : [];

    const segments = input.segments?.length
      ? await transaction
          .insert(schema.workoutSessionSegments)
          .values(
            input.segments.map((segment) => ({
              workoutSessionId: session.id,
              position: segment.position,
              segmentType: segment.segmentType,
              distance: segment.distance ?? null,
              distanceUnit: segment.distanceUnit ?? null,
              durationSeconds: segment.durationSeconds ?? null,
              recoverySeconds: segment.recoverySeconds ?? null,
              notes: segment.notes ?? null,
              configuration: segment.configuration ?? null,
            })),
          )
          .returning()
      : [];

    const movements = [];
    for (const movementInput of movementInputs) {
      const [movement] = await transaction
        .insert(schema.sessionMovementResults)
        .values({
          workoutSessionId: session.id,
          blockMovementId: movementInput.blockMovementId ?? null,
          movementId: movementInput.movementId ?? null,
          movementName: movementInput.movementName,
          position: movementInput.position,
          notes: movementInput.notes ?? null,
          config: movementInput.config ?? null,
        })
        .returning();

      if (!movement) {
        throw new Error("Session movement result could not be created");
      }

      const sets = movementInput.sets.length
        ? await transaction
            .insert(schema.setResults)
            .values(
              movementInput.sets.map((set) => ({
                sessionMovementResultId: movement.id,
                position: set.position,
                reps: set.reps ?? null,
                load: set.load ?? null,
                loadUnit: set.loadUnit ?? null,
                durationSeconds: set.durationSeconds ?? null,
                distance: set.distance ?? null,
                distanceUnit: set.distanceUnit ?? null,
                calories: set.calories ?? null,
                completed: set.completed ?? true,
                notes: set.notes ?? null,
                config: set.config ?? null,
              })),
            )
            .returning()
        : [];

      movements.push({ ...movement, sets });
    }

    return { ...session, metrics, movements, segments };
}

export async function createWorkoutSessionWithResults(
  input: CreateWorkoutSessionWithResultsInput,
) {
  return getDatabase().transaction(async (transaction) => {
    return insertWorkoutSessionWithResults(transaction, input);
  });
}

/** Internal loader. Not an authorization boundary; do not expose unguarded. */
export async function getWorkoutSessionWithResults(workoutSessionId: string) {
  const database = getDatabase();
  const [session] = await database
    .select()
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, workoutSessionId))
    .limit(1);

  if (!session) return null;

  const [metrics, movements, segments] = await Promise.all([
    database
      .select()
      .from(schema.workoutSessionMetrics)
      .where(
        eq(schema.workoutSessionMetrics.workoutSessionId, workoutSessionId),
      )
      .orderBy(asc(schema.workoutSessionMetrics.position)),
    database
      .select()
      .from(schema.sessionMovementResults)
      .where(
        eq(schema.sessionMovementResults.workoutSessionId, workoutSessionId),
      )
      .orderBy(asc(schema.sessionMovementResults.position)),
    database
      .select()
      .from(schema.workoutSessionSegments)
      .where(
        eq(schema.workoutSessionSegments.workoutSessionId, workoutSessionId),
      )
      .orderBy(asc(schema.workoutSessionSegments.position)),
  ]);

  const sets = movements.length
    ? await database
        .select()
        .from(schema.setResults)
        .where(
          inArray(
            schema.setResults.sessionMovementResultId,
            movements.map((movement) => movement.id),
          ),
        )
        .orderBy(
          asc(schema.setResults.sessionMovementResultId),
          asc(schema.setResults.position),
        )
    : [];

  return {
    ...session,
    metrics,
    segments,
    movements: movements.map((movement) => ({
      ...movement,
      sets: sets.filter(
        (set) => set.sessionMovementResultId === movement.id,
      ),
    })),
  };
}

export async function searchMovements(input: { query: string; limit?: number }) {
  const query = input.query.trim();
  return getDatabase()
    .select({
      id: schema.movements.id,
      name: schema.movements.name,
      category: schema.movements.category,
      equipment: schema.movements.equipment,
    })
    .from(schema.movements)
    .where(query ? ilike(schema.movements.name, `%${query}%`) : undefined)
    .orderBy(asc(schema.movements.name))
    .limit(Math.min(Math.max(input.limit ?? 8, 1), 20));
}

const recentCatalogLimit = 8;
const recentCustomLimit = 10;

function normalizeMovementName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function assertKnownMovementIds(
  transaction: DatabaseTransaction,
  movements: Array<{ movementId?: string | null }>,
) {
  const movementIds = [...new Set(
    movements.flatMap((movement) => movement.movementId ? [movement.movementId] : []),
  )];
  if (!movementIds.length) return;

  const found = await transaction
    .select({ id: schema.movements.id })
    .from(schema.movements)
    .where(inArray(schema.movements.id, movementIds));

  if (found.length !== movementIds.length) {
    throw new WorkoutRequestError("That exercise could not be found");
  }
}

export async function listRecentMovementsForUser(userId: string) {
  const rows = await getDatabase()
    .select({
      movementId: schema.sessionMovementResults.movementId,
      movementName: schema.sessionMovementResults.movementName,
      occurredAt: schema.workoutSessions.occurredAt,
      catalogId: schema.movements.id,
      catalogName: schema.movements.name,
      category: schema.movements.category,
      equipment: schema.movements.equipment,
    })
    .from(schema.sessionMovementResults)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.sessionMovementResults.workoutSessionId, schema.workoutSessions.id),
    )
    .leftJoin(
      schema.movements,
      eq(schema.sessionMovementResults.movementId, schema.movements.id),
    )
    .where(eq(schema.workoutSessions.userId, userId))
    .orderBy(
      desc(schema.workoutSessions.occurredAt),
      desc(schema.sessionMovementResults.createdAt),
    )
    .limit(80);

  const recent: Array<{
    id: string;
    name: string;
    category: string | null;
    equipment: string | null;
  }> = [];
  const recentCustom: Array<{ name: string }> = [];
  const seenCatalog = new Set<string>();
  const seenCustom = new Set<string>();

  for (const row of rows) {
    if (row.catalogId && !seenCatalog.has(row.catalogId) && recent.length < recentCatalogLimit) {
      seenCatalog.add(row.catalogId);
      recent.push({
        id: row.catalogId,
        name: row.catalogName ?? row.movementName,
        category: row.category,
        equipment: row.equipment,
      });
      continue;
    }

    if (row.movementId || row.catalogId) continue;

    const normalized = normalizeMovementName(row.movementName);
    if (!normalized || seenCustom.has(normalized) || recentCustom.length >= recentCustomLimit) {
      continue;
    }
    seenCustom.add(normalized);
    recentCustom.push({ name: row.movementName.trim().replace(/\s+/g, " ") });
  }

  return { recent, recentCustom };
}

export async function getLastMovementSessionForUser(input: {
  userId: string;
  movementId?: string;
  movementName?: string;
  excludeSessionId?: string;
}) {
  const database = getDatabase();
  const normalizedName = input.movementName ? normalizeMovementName(input.movementName) : "";
  if (!input.movementId && !normalizedName) return null;

  const movementMatch = input.movementId
    ? eq(schema.sessionMovementResults.movementId, input.movementId)
    : and(
        isNull(schema.sessionMovementResults.movementId),
        sql`lower(regexp_replace(btrim(${schema.sessionMovementResults.movementName}), '\\s+', ' ', 'g')) = ${normalizedName}`,
      );

  const [match] = await database
    .select({
      movementResultId: schema.sessionMovementResults.id,
      movementId: schema.sessionMovementResults.movementId,
      movementName: schema.sessionMovementResults.movementName,
      occurredAt: schema.workoutSessions.occurredAt,
    })
    .from(schema.sessionMovementResults)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.sessionMovementResults.workoutSessionId, schema.workoutSessions.id),
    )
    .where(and(
      eq(schema.workoutSessions.userId, input.userId),
      movementMatch,
      input.excludeSessionId
        ? ne(schema.workoutSessions.id, input.excludeSessionId)
        : undefined,
    ))
    .orderBy(
      desc(schema.workoutSessions.occurredAt),
      desc(schema.sessionMovementResults.position),
    )
    .limit(1);

  if (!match) return null;

  const sets = await database
    .select({
      reps: schema.setResults.reps,
      load: schema.setResults.load,
      loadUnit: schema.setResults.loadUnit,
      durationSeconds: schema.setResults.durationSeconds,
      distance: schema.setResults.distance,
      distanceUnit: schema.setResults.distanceUnit,
      calories: schema.setResults.calories,
    })
    .from(schema.setResults)
    .where(eq(schema.setResults.sessionMovementResultId, match.movementResultId))
    .orderBy(asc(schema.setResults.position));

  return {
    occurredAt: match.occurredAt.toISOString(),
    movementId: match.movementId,
    movementName: match.movementName,
    sets: sets.map((set) => ({
      reps: set.reps ?? null,
      load: finiteNumber(set.load),
      loadUnit: set.loadUnit,
      durationSeconds: set.durationSeconds ?? null,
      distance: finiteNumber(set.distance),
      distanceUnit: set.distanceUnit,
      calories: set.calories ?? null,
    })),
  };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function createGroup(input: { ownerId: string; name: string }) {
  const database = getDatabase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await database.transaction(async (transaction) => {
        const [group] = await transaction
          .insert(schema.groups)
          .values({
            name: input.name,
            ownerId: input.ownerId,
            inviteCode: generateInviteCode(),
          })
          .returning();

        if (!group) throw new Error("Group could not be created");

        await transaction.insert(schema.groupMembers).values({
          groupId: group.id,
          userId: input.ownerId,
          role: "owner",
        });

        return { ...group, role: "owner" as const };
      });
    } catch (error) {
      if (!isInviteCodeCollision(error) || attempt === 4) throw error;
    }
  }

  throw new Error("A unique invite code could not be generated");
}

const inviteCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode() {
  return Array.from(randomBytes(8), (byte) =>
    inviteCodeAlphabet.charAt(byte % inviteCodeAlphabet.length),
  ).join("");
}

function isInviteCodeCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const databaseError = error as {
    cause?: unknown;
    code?: unknown;
    constraint?: unknown;
  };
  if (
    databaseError.code === "23505" &&
    databaseError.constraint === "groups_invite_code_unique"
  ) {
    return true;
  }

  return databaseError.cause
    ? isInviteCodeCollision(databaseError.cause)
    : false;
}

function groupPreviewSelection(userId: string) {
  return {
    id: schema.groups.id,
    name: schema.groups.name,
    memberCount: count(schema.groupMembers.userId),
    isMember: sql<boolean>`coalesce(bool_or(${schema.groupMembers.userId} = ${userId}), false)`,
  };
}

const activeMemberJoin = and(
  eq(schema.groupMembers.groupId, schema.groups.id),
  activeMembership,
);

export function searchGroupsForUser(input: {
  userId: string;
  query: string;
  limit?: number;
}) {
  const escapedQuery = input.query.replace(/[\\%_]/g, "\\$&");

  return getDatabase()
    .select(groupPreviewSelection(input.userId))
    .from(schema.groups)
    .leftJoin(schema.groupMembers, activeMemberJoin)
    .where(
      and(
        openGroup,
        ilike(schema.groups.name, `%${escapedQuery}%`),
        sql`exists (
          select 1
          from ${schema.groupMembers} as member_self
          where member_self.group_id = ${schema.groups.id}
            and member_self.user_id = ${input.userId}
            and member_self.left_at is null
        )`,
      ),
    )
    .groupBy(schema.groups.id)
    .orderBy(asc(schema.groups.name))
    .limit(input.limit ?? 10);
}

export async function getGroupPreviewByInviteCode(input: {
  userId: string;
  inviteCode: string;
}) {
  const [group] = await getDatabase()
    .select(groupPreviewSelection(input.userId))
    .from(schema.groups)
    .leftJoin(schema.groupMembers, activeMemberJoin)
    .where(
      and(
        openGroup,
        eq(schema.groups.inviteCode, input.inviteCode.toUpperCase()),
      ),
    )
    .groupBy(schema.groups.id)
    .limit(1);

  return group ?? null;
}

export async function getPublicGroupInviteByCode(inviteCode: string) {
  const [group] = await getDatabase()
    .select({
      name: schema.groups.name,
      inviteCode: schema.groups.inviteCode,
    })
    .from(schema.groups)
    .where(
      and(
        openGroup,
        eq(schema.groups.inviteCode, inviteCode.toUpperCase()),
      ),
    )
    .limit(1);

  return group ?? null;
}

export async function joinGroupByInviteCode(input: {
  userId: string;
  inviteCode: string;
}) {
  const group = await getGroupPreviewByInviteCode(input);
  if (!group) return null;
  return joinGroup({
    userId: input.userId,
    groupId: group.id,
    inviteCode: input.inviteCode,
  });
}

export async function joinGroup(input: {
  userId: string;
  groupId: string;
  inviteCode: string;
}) {
  const inviteCode = input.inviteCode.trim().toUpperCase();

  return getDatabase().transaction(async (transaction) => {
    const [group] = await transaction
      .select({ id: schema.groups.id, name: schema.groups.name })
      .from(schema.groups)
      .where(
        and(
          eq(schema.groups.id, input.groupId),
          eq(schema.groups.inviteCode, inviteCode),
          openGroup,
        ),
      )
      .limit(1);

    if (!group) return null;

    const [existing] = await transaction
      .select({
        role: schema.groupMembers.role,
        leftAt: schema.groupMembers.leftAt,
      })
      .from(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing && existing.leftAt == null) {
      const [memberTotal] = await transaction
        .select({ value: count() })
        .from(schema.groupMembers)
        .where(
          and(eq(schema.groupMembers.groupId, input.groupId), activeMembership),
        );

      return {
        group: {
          ...group,
          memberCount: memberTotal?.value ?? 0,
          isMember: true,
        },
        membership: { role: existing.role },
        alreadyMember: true,
      };
    }

    const now = new Date();
    if (existing) {
      await transaction
        .update(schema.groupMembers)
        .set({
          leftAt: null,
          joinedAt: now,
          contentVisibleAfter: now,
          role: "member",
        })
        .where(
          and(
            eq(schema.groupMembers.groupId, input.groupId),
            eq(schema.groupMembers.userId, input.userId),
          ),
        );
    } else {
      await transaction.insert(schema.groupMembers).values({
        groupId: input.groupId,
        userId: input.userId,
        role: "member",
      });
    }

    const [membership, memberTotal] = await Promise.all([
      transaction
        .select({ role: schema.groupMembers.role })
        .from(schema.groupMembers)
        .where(
          and(
            eq(schema.groupMembers.groupId, input.groupId),
            eq(schema.groupMembers.userId, input.userId),
            activeMembership,
          ),
        )
        .limit(1),
      transaction
        .select({ value: count() })
        .from(schema.groupMembers)
        .where(
          and(eq(schema.groupMembers.groupId, input.groupId), activeMembership),
        ),
    ]);

    if (!membership[0]) throw new Error("Group membership could not be loaded");

    return {
      group: {
        ...group,
        memberCount: memberTotal[0]?.value ?? 0,
        isMember: true,
      },
      membership: membership[0],
      alreadyMember: false,
    };
  });
}

export function listGroupsForUser(userId: string) {
  return getDatabase()
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      ownerId: schema.groups.ownerId,
      createdAt: schema.groups.createdAt,
      role: schema.groupMembers.role,
      photoPath: schema.groups.photoPath,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(and(viewerActiveMembership(userId), openGroup))
    .orderBy(desc(schema.groups.createdAt));
}

export async function getGroupForMember(input: {
  groupId: string;
  userId: string;
}) {
  const [group] = await getDatabase()
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      inviteCode: schema.groups.inviteCode,
      ownerId: schema.groups.ownerId,
      createdAt: schema.groups.createdAt,
      role: schema.groupMembers.role,
      photoPath: schema.groups.photoPath,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        viewerActiveMembership(input.userId),
        openGroup,
      ),
    )
    .limit(1);

  return group ?? null;
}

export async function createWorkoutForMember(input: {
  userId: string;
  displayName: string;
  groupId: string;
  workoutType: string;
  workoutSubtype?: (typeof schema.runWorkoutSubtypes)[number] | null;
  title: string;
  name: string | null;
  durationMinutes: number | null;
  effort: number | null;
  caption: string | null;
  photoPath: string | null;
  occurredAt: Date;
  metrics?: Omit<CreateWorkoutSessionMetricInput, "position">[];
  movements?: Array<
    Omit<CreateSessionMovementResultInput, "position" | "sets"> & {
      sets: Omit<CreateSetResultInput, "position">[];
    }
  >;
  segments?: CreateWorkoutSessionSegmentInput[];
} & WorkoutFormatColumnInput) {
  return getDatabase().transaction(async (transaction) => {
    await lockUserGoals(transaction, input.userId);
    const [membership] = await transaction
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          viewerActiveMembership(input.userId),
          openGroup,
        ),
      )
      .limit(1);

    if (!membership) {
      return null;
    }

    const sessionId = randomUUID();
    const postId = randomUUID();
    const createdAt = new Date();

    const session = await insertWorkoutSessionWithResults(transaction, {
      session: {
        id: sessionId,
        userId: input.userId,
        workoutType: input.workoutType,
        workoutSubtype: input.workoutSubtype ?? null,
        workoutFormat: input.workoutFormat ?? null,
        formatDurationSeconds: input.formatDurationSeconds ?? null,
        formatIntervalSeconds: input.formatIntervalSeconds ?? null,
        formatRounds: input.formatRounds ?? null,
        timeCapSeconds: input.timeCapSeconds ?? null,
        scoreFinished: input.scoreFinished ?? null,
        scoreTimeSeconds: input.scoreTimeSeconds ?? null,
        scoreRounds: input.scoreRounds ?? null,
        scoreReps: input.scoreReps ?? null,
        name: input.name ?? input.title,
        durationMinutes: input.durationMinutes,
        effort: input.effort,
        occurredAt: input.occurredAt,
        notes: null,
        createdAt,
        updatedAt: createdAt,
      },
      metrics: input.metrics?.map((metric, position) => ({ ...metric, position })),
      movements: input.movements?.map((movement, position) => ({
        ...movement,
        position,
        sets: movement.sets.map((set, setPosition) => ({
          ...set,
          position: setPosition,
        })),
      })),
      segments: input.segments,
    });

    const [post] = await transaction
      .insert(schema.communityPosts)
      .values({
        id: postId,
        userId: input.userId,
        groupId: input.groupId,
        workoutSessionId: session.id,
        caption: input.caption,
        photoPath: input.photoPath,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    if (!post) {
      throw new Error("Community post could not be created");
    }

    const pr = await detectPersonalRecordsForSession({
      groupId: input.groupId,
      sessionId: session.id,
      transaction,
      userId: input.userId,
    });
    const goals = await evaluateGoalsForSession({
      groupId: input.groupId,
      sessionId: session.id,
      transaction,
      userId: input.userId,
    });

    return {
      id: session.id,
      communityPostId: post.id,
      userId: session.userId,
      groupId: post.groupId,
      workoutType: session.workoutType,
      workoutFormat: session.workoutFormat ?? null,
      title: session.name ?? session.workoutType,
      name: session.name,
      durationMinutes: session.durationMinutes,
      effort: session.effort,
      caption: post.caption,
      photoPath: post.photoPath,
      notes: post.caption,
      occurredAt: session.occurredAt,
      completedAt: session.occurredAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      displayName: input.displayName,
      pr,
      goals,
    };
  });
}

export async function updateWorkoutForOwner(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
  workoutType: string;
  workoutSubtype?: (typeof schema.runWorkoutSubtypes)[number] | null;
  name: string | null;
  durationMinutes: number | null;
  effort: number | null;
  caption: string | null;
  photoPath: string | null;
  occurredAt: Date;
  metrics?: Omit<CreateWorkoutSessionMetricInput, "position">[];
  movements?: Array<
    Omit<CreateSessionMovementResultInput, "position" | "sets"> & {
      sets: Omit<CreateSetResultInput, "position">[];
    }
  >;
  segments?: CreateWorkoutSessionSegmentInput[];
} & WorkoutFormatColumnInput) {
  return getDatabase().transaction(async (transaction) => {
    await lockUserGoals(transaction, input.userId);
    const [owned] = await transaction
      .select({
        postId: schema.communityPosts.id,
        sessionId: schema.workoutSessions.id,
      })
      .from(schema.communityPosts)
      .innerJoin(
        schema.workoutSessions,
        eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
      )
      .where(and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
        eq(schema.communityPosts.userId, input.userId),
        eq(schema.workoutSessions.userId, input.userId),
      ))
      .limit(1);

    if (!owned) return null;
    const previousKeys = await collectSessionPrKeys(owned.sessionId, transaction);

    const now = new Date();
    await transaction
      .update(schema.workoutSessions)
      .set({
        workoutType: input.workoutType,
        workoutSubtype: input.workoutSubtype ?? null,
        workoutFormat: input.workoutFormat ?? null,
        formatDurationSeconds: input.formatDurationSeconds ?? null,
        formatIntervalSeconds: input.formatIntervalSeconds ?? null,
        formatRounds: input.formatRounds ?? null,
        timeCapSeconds: input.timeCapSeconds ?? null,
        scoreFinished: input.scoreFinished ?? null,
        scoreTimeSeconds: input.scoreTimeSeconds ?? null,
        scoreRounds: input.scoreRounds ?? null,
        scoreReps: input.scoreReps ?? null,
        name: input.name,
        durationMinutes: input.durationMinutes,
        effort: input.effort,
        occurredAt: input.occurredAt,
        updatedAt: now,
      })
      .where(eq(schema.workoutSessions.id, owned.sessionId));
    await transaction
      .update(schema.communityPosts)
      .set({ caption: input.caption, photoPath: input.photoPath, updatedAt: now })
      .where(eq(schema.communityPosts.id, owned.postId));

    // Sets cascade from movement results. The other canonical result tables
    // are direct session children and are replaced in the same transaction.
    await transaction.delete(schema.workoutSessionMetrics).where(
      eq(schema.workoutSessionMetrics.workoutSessionId, owned.sessionId),
    );
    await transaction.delete(schema.workoutSessionSegments).where(
      eq(schema.workoutSessionSegments.workoutSessionId, owned.sessionId),
    );
    await transaction.delete(schema.sessionMovementResults).where(
      eq(schema.sessionMovementResults.workoutSessionId, owned.sessionId),
    );

    if (input.metrics?.length) {
      await transaction.insert(schema.workoutSessionMetrics).values(
        input.metrics.map((metric, position) => ({
          workoutSessionId: owned.sessionId,
          position,
          metricType: metric.metricType,
          label: metric.label ?? null,
          numericValue: metric.numericValue ?? null,
          textValue: metric.textValue ?? null,
          unit: metric.unit ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    if (input.segments?.length) {
      await transaction.insert(schema.workoutSessionSegments).values(
        input.segments.map((segment) => ({
          workoutSessionId: owned.sessionId,
          position: segment.position,
          segmentType: segment.segmentType,
          distance: segment.distance ?? null,
          distanceUnit: segment.distanceUnit ?? null,
          durationSeconds: segment.durationSeconds ?? null,
          recoverySeconds: segment.recoverySeconds ?? null,
          notes: segment.notes ?? null,
          configuration: segment.configuration ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    await assertKnownMovementIds(transaction, input.movements ?? []);
    for (const [position, movementInput] of (input.movements ?? []).entries()) {
      const [movement] = await transaction.insert(schema.sessionMovementResults).values({
        workoutSessionId: owned.sessionId,
        movementId: movementInput.movementId ?? null,
        movementName: movementInput.movementName,
        position,
        notes: movementInput.notes ?? null,
        config: movementInput.config ?? null,
        createdAt: now,
        updatedAt: now,
      }).returning({ id: schema.sessionMovementResults.id });
      if (!movement) throw new Error("Workout movement could not be updated");
      if (movementInput.sets.length) {
        await transaction.insert(schema.setResults).values(
          movementInput.sets.map((set, setPosition) => ({
            sessionMovementResultId: movement.id,
            position: setPosition,
            reps: set.reps ?? null,
            load: set.load ?? null,
            loadUnit: set.loadUnit ?? null,
            durationSeconds: set.durationSeconds ?? null,
            distance: set.distance ?? null,
            distanceUnit: set.distanceUnit ?? null,
            calories: set.calories ?? null,
            completed: set.completed ?? true,
            notes: set.notes ?? null,
            config: set.config ?? null,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }

    const pr = await recomputePersonalRecordsForSession({
      groupId: input.groupId,
      previousKeys,
      sessionId: owned.sessionId,
      transaction,
      userId: input.userId,
    });
    const goals = await evaluateGoalsForSession({
      groupId: input.groupId,
      sessionId: owned.sessionId,
      transaction,
      userId: input.userId,
    });

    return { postId: owned.postId, sessionId: owned.sessionId, pr, goals };
  });
}

export async function deleteCommunityPostForOwner(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
  deleteWorkout: boolean;
}) {
  return getDatabase().transaction(async (transaction) => {
    await lockUserGoals(transaction, input.userId);
    const [owned] = await transaction
      .select({
        photoPath: schema.communityPosts.photoPath,
        postId: schema.communityPosts.id,
        sessionId: schema.workoutSessions.id,
      })
      .from(schema.communityPosts)
      .innerJoin(
        schema.workoutSessions,
        eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
      )
      .where(and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
        eq(schema.communityPosts.userId, input.userId),
        eq(schema.workoutSessions.userId, input.userId),
      ))
      .limit(1);

    if (!owned) return null;
    const keys = input.deleteWorkout
      ? await collectSessionPrKeys(owned.sessionId, transaction)
      : [];
    const photoPaths = input.deleteWorkout
      ? (await transaction
          .select({ photoPath: schema.communityPosts.photoPath })
          .from(schema.communityPosts)
          .where(eq(schema.communityPosts.workoutSessionId, owned.sessionId)))
          .flatMap((post) => post.photoPath ? [post.photoPath] : [])
      : owned.photoPath ? [owned.photoPath] : [];
    if (input.deleteWorkout) {
      const [foreignPost] = await transaction
        .select({ id: schema.communityPosts.id })
        .from(schema.communityPosts)
        .where(and(
          eq(schema.communityPosts.workoutSessionId, owned.sessionId),
          ne(schema.communityPosts.userId, input.userId),
        ))
        .limit(1);
      if (foreignPost) throw new Error("Workout session has an inconsistent post owner");
      const sessionPosts = await transaction
        .select({ id: schema.communityPosts.id })
        .from(schema.communityPosts)
        .where(eq(schema.communityPosts.workoutSessionId, owned.sessionId));
      for (const post of sessionPosts) {
        await dismissOpenReportsForCommunityPost(transaction, post.id);
      }
      await transaction.delete(schema.workoutSessions).where(
        and(
          eq(schema.workoutSessions.id, owned.sessionId),
          eq(schema.workoutSessions.userId, input.userId),
        ),
      );
      await recomputePersonalRecordsAfterDelete({
        keys,
        transaction,
        userId: input.userId,
      });
      await recomputeGoalsForUser({
        transaction,
        userId: input.userId,
      });
    } else {
      await dismissOpenReportsForCommunityPost(transaction, owned.postId);
      await transaction.delete(schema.communityPosts).where(
        and(
          eq(schema.communityPosts.id, owned.postId),
          eq(schema.communityPosts.userId, input.userId),
        ),
      );
    }
    return { photoPaths };
  });
}

export type AccountDeletionResult = {
  deletedUser: boolean;
  deletedGroupIds: string[];
  transferredGroups: Array<{ groupId: string; newOwnerId: string }>;
};

// Removes one application user. Groups they own move to the longest-standing
// other member (earliest joined_at, then user id). A group with nobody else
// left is deleted, which removes its invite code, memberships, posts, and
// legacy workout rows. Personal workout sessions of former members stay.
// Definitions are deleted explicitly because their user foreign key is
// ON DELETE SET NULL. Metrics, segments, movement results, and set results
// cascade from the user's workout sessions.
export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
  return getDatabase().transaction(async (transaction) => {
    const [existingUser] = await transaction
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
      .for("update");

    if (!existingUser) {
      return { deletedUser: false, deletedGroupIds: [], transferredGroups: [] };
    }

    const ownership = await releaseOwnedGroups(transaction, userId);
    await deleteRowsOwnedByUser(transaction, userId);
    return { deletedUser: true, ...ownership };
  });
}

async function releaseOwnedGroups(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<Pick<AccountDeletionResult, "deletedGroupIds" | "transferredGroups">> {
  const ownedGroups = await transaction
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(eq(schema.groups.ownerId, userId))
    .orderBy(asc(schema.groups.id))
    .for("update");

  const deletedGroupIds: string[] = [];
  const transferredGroups: AccountDeletionResult["transferredGroups"] = [];

  for (const group of ownedGroups) {
    const [successor] = await transaction
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(and(
        eq(schema.groupMembers.groupId, group.id),
        ne(schema.groupMembers.userId, userId),
        activeMembership,
      ))
      .orderBy(asc(schema.groupMembers.joinedAt), asc(schema.groupMembers.userId))
      .limit(1);

    if (!successor) {
      await transaction.delete(schema.groups).where(eq(schema.groups.id, group.id));
      deletedGroupIds.push(group.id);
      continue;
    }

    await transaction
      .update(schema.groupMembers)
      .set({ role: "owner" })
      .where(and(
        eq(schema.groupMembers.groupId, group.id),
        eq(schema.groupMembers.userId, successor.userId),
      ));
    await transaction
      .update(schema.groups)
      .set({ ownerId: successor.userId })
      .where(eq(schema.groups.id, group.id));
    await transaction
      .delete(schema.groupMembers)
      .where(and(
        eq(schema.groupMembers.groupId, group.id),
        eq(schema.groupMembers.userId, userId),
      ));
    transferredGroups.push({ groupId: group.id, newOwnerId: successor.userId });
  }

  return { deletedGroupIds, transferredGroups };
}

async function deleteRowsOwnedByUser(transaction: DatabaseTransaction, userId: string) {
  const [ownedPosts, ownedComments] = await Promise.all([
    transaction
      .select({ id: schema.communityPosts.id })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.userId, userId)),
    transaction
      .select({ id: schema.communityPostComments.id })
      .from(schema.communityPostComments)
      .where(eq(schema.communityPostComments.userId, userId)),
  ]);
  for (const post of ownedPosts) {
    await dismissOpenReportsForCommunityPost(transaction, post.id);
  }
  for (const comment of ownedComments) {
    await dismissOpenReportsForComment(transaction, comment.id);
  }
  await transaction
    .delete(schema.userBlocks)
    .where(eq(schema.userBlocks.blockerId, userId));
  await transaction
    .delete(schema.userBlocks)
    .where(eq(schema.userBlocks.blockedId, userId));
  await transaction
    .delete(schema.contentReports)
    .where(eq(schema.contentReports.reporterId, userId));
  await transaction
    .delete(schema.communityPostReactions)
    .where(eq(schema.communityPostReactions.userId, userId));
  await transaction
    .delete(schema.communityPostComments)
    .where(eq(schema.communityPostComments.userId, userId));
  await transaction
    .delete(schema.communityPosts)
    .where(eq(schema.communityPosts.userId, userId));
  await transaction.delete(schema.workouts).where(eq(schema.workouts.userId, userId));
  await transaction
    .delete(schema.workoutSessions)
    .where(eq(schema.workoutSessions.userId, userId));
  await transaction
    .delete(schema.workoutDefinitions)
    .where(eq(schema.workoutDefinitions.createdByUserId, userId));
  await transaction
    .delete(schema.groupMembers)
    .where(eq(schema.groupMembers.userId, userId));
  await transaction.delete(schema.users).where(eq(schema.users.id, userId));
}

export async function listRecentWorkoutsForMember(input: {
  userId: string;
  groupId: string;
  limit?: number;
  includeReactionCounts?: boolean;
  includeCommentCounts?: boolean;
}) {
  return listRecentWorkouts({ ...input, verifyMembership: true });
}

export async function listRecentWorkoutsForAuthorizedGroup(input: {
  groupId: string;
  viewerUserId: string;
  limit?: number;
  includeReactionCounts?: boolean;
  includeCommentCounts?: boolean;
  occurredAtStart?: Date;
  occurredAtEnd?: Date;
}) {
  if (!input.viewerUserId) throw new Error("A viewer is required to list workouts");
  return listRecentWorkouts({
    userId: input.viewerUserId,
    groupId: input.groupId,
    limit: input.limit,
    includeReactionCounts: input.includeReactionCounts,
    includeCommentCounts: input.includeCommentCounts,
    occurredAtStart: input.occurredAtStart,
    occurredAtEnd: input.occurredAtEnd,
    verifyMembership: false,
  });
}

async function listRecentWorkouts(input: {
  userId: string;
  groupId: string;
  limit?: number;
  includeReactionCounts?: boolean;
  includeCommentCounts?: boolean;
  occurredAtStart?: Date;
  occurredAtEnd?: Date;
  verifyMembership: boolean;
}) {
  const database = getDatabase();
  if (input.verifyMembership) {
    const [membership] = await database
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          viewerActiveMembership(input.userId),
          openGroup,
        ),
      )
      .limit(1);

    if (!membership) {
      return null;
    }
  }

  const posts = await database
    .select({
      id: schema.workoutSessions.id,
      communityPostId: schema.communityPosts.id,
      userId: schema.workoutSessions.userId,
      groupId: schema.communityPosts.groupId,
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
      caption: schema.communityPosts.caption,
      photoPath: schema.communityPosts.photoPath,
      occurredAt: schema.workoutSessions.occurredAt,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      displayName: schema.users.displayName,
      fireReactionCount: input.includeReactionCounts
        ? visibleReactionCountSql(input.userId, "fire")
        : sql<number>`0`.mapWith(Number),
      strongReactionCount: input.includeReactionCounts
        ? visibleReactionCountSql(input.userId, "strong")
        : sql<number>`0`.mapWith(Number),
      clapReactionCount: input.includeReactionCounts
        ? visibleReactionCountSql(input.userId, "clap")
        : sql<number>`0`.mapWith(Number),
      commentCount: input.includeCommentCounts
        ? visibleCommentCountSql(input.userId)
        : sql<number>`0`.mapWith(Number),
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(
        schema.communityPosts.workoutSessionId,
        schema.workoutSessions.id,
      ),
    )
    .innerJoin(
      schema.users,
      eq(schema.workoutSessions.userId, schema.users.id),
    )
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      communityPostVisibleToSql(input.userId, schema.communityPosts.id),
      input.occurredAtStart ? gte(schema.workoutSessions.occurredAt, input.occurredAtStart) : undefined,
      input.occurredAtEnd ? lt(schema.workoutSessions.occurredAt, input.occurredAtEnd) : undefined,
    ))
    .orderBy(
      desc(schema.workoutSessions.occurredAt),
      desc(schema.communityPosts.createdAt),
    )
    .limit(input.limit ?? 30);

  if (!posts.length) return [];

  const metricSessionIds = [
    ...new Set(
      posts
        .filter((post) =>
          (workoutTypesWithFeedMetrics as readonly string[]).includes(
            post.workoutType,
          ))
        .map((post) => post.id),
    ),
  ];
  const movementSessionIds = [
    ...new Set(
      posts
        .filter((post) =>
          ["strength_training", "powerlifting"].includes(post.workoutType)
          || (post.workoutType === "functional_fitness" && post.workoutFormat))
        .map((post) => post.id),
    ),
  ];
  const intervalSessionIds = [
    ...new Set(
      posts
        .filter((post) => post.workoutType === "run" && post.workoutSubtype === "interval")
        .map((post) => post.id),
    ),
  ];
  const [metrics, movementSetRows, intervalSegments] = await Promise.all([
    metricSessionIds.length
      ? database
          .select({
            workoutSessionId: schema.workoutSessionMetrics.workoutSessionId,
            metricType: schema.workoutSessionMetrics.metricType,
            numericValue: schema.workoutSessionMetrics.numericValue,
            textValue: schema.workoutSessionMetrics.textValue,
            unit: schema.workoutSessionMetrics.unit,
          })
          .from(schema.workoutSessionMetrics)
          .where(
            inArray(
              schema.workoutSessionMetrics.workoutSessionId,
              metricSessionIds,
            ),
          )
          .orderBy(
            asc(schema.workoutSessionMetrics.workoutSessionId),
            asc(schema.workoutSessionMetrics.position),
          )
      : Promise.resolve([]),
    movementSessionIds.length
      ? database
          .select({
            workoutSessionId: schema.sessionMovementResults.workoutSessionId,
            movementResultId: schema.sessionMovementResults.id,
            movementName: schema.sessionMovementResults.movementName,
            movementPosition: schema.sessionMovementResults.position,
            setId: schema.setResults.id,
            setPosition: schema.setResults.position,
            reps: schema.setResults.reps,
            load: schema.setResults.load,
            loadUnit: schema.setResults.loadUnit,
          })
          .from(schema.sessionMovementResults)
          .leftJoin(
            schema.setResults,
            eq(
              schema.setResults.sessionMovementResultId,
              schema.sessionMovementResults.id,
            ),
          )
          .where(
            inArray(
              schema.sessionMovementResults.workoutSessionId,
              movementSessionIds,
            ),
          )
          .orderBy(
            asc(schema.sessionMovementResults.workoutSessionId),
            asc(schema.sessionMovementResults.position),
            asc(schema.setResults.position),
          )
      : Promise.resolve([]),
    intervalSessionIds.length
      ? database
          .select({
            workoutSessionId: schema.workoutSessionSegments.workoutSessionId,
            segmentType: schema.workoutSessionSegments.segmentType,
            distance: schema.workoutSessionSegments.distance,
            distanceUnit: schema.workoutSessionSegments.distanceUnit,
            durationSeconds: schema.workoutSessionSegments.durationSeconds,
            recoverySeconds: schema.workoutSessionSegments.recoverySeconds,
          })
          .from(schema.workoutSessionSegments)
          .where(inArray(schema.workoutSessionSegments.workoutSessionId, intervalSessionIds))
          .orderBy(
            asc(schema.workoutSessionSegments.workoutSessionId),
            asc(schema.workoutSessionSegments.position),
          )
      : Promise.resolve([]),
  ]);

  const metricsBySession = new Map<
    string,
    Array<(typeof metrics)[number]>
  >();
  for (const metric of metrics) {
    const sessionMetrics = metricsBySession.get(metric.workoutSessionId) ?? [];
    sessionMetrics.push(metric);
    metricsBySession.set(metric.workoutSessionId, sessionMetrics);
  }

  const segmentsBySession = new Map<string, Array<(typeof intervalSegments)[number]>>();
  for (const segment of intervalSegments) {
    const sessionSegments = segmentsBySession.get(segment.workoutSessionId) ?? [];
    sessionSegments.push(segment);
    segmentsBySession.set(segment.workoutSessionId, sessionSegments);
  }

  const movementsBySession = new Map<
    string,
    Map<string, WorkoutResultMovement>
  >();
  for (const row of movementSetRows) {
    let sessionMovements = movementsBySession.get(row.workoutSessionId);
    if (!sessionMovements) {
      sessionMovements = new Map();
      movementsBySession.set(row.workoutSessionId, sessionMovements);
    }

    let movement = sessionMovements.get(row.movementResultId);
    if (!movement) {
      movement = { movementName: row.movementName, sets: [] };
      sessionMovements.set(row.movementResultId, movement);
    }

    if (row.setId) {
      movement.sets.push({
        reps: row.reps,
        load: row.load,
        loadUnit: row.loadUnit,
      });
    }
  }

  const mapped = posts.map(({
    fireReactionCount,
    strongReactionCount,
    clapReactionCount,
    commentCount,
    workoutSubtype,
    formatDurationSeconds,
    formatIntervalSeconds,
    formatRounds,
    timeCapSeconds,
    scoreFinished,
    scoreTimeSeconds,
    scoreRounds,
    scoreReps,
    ...post
  }) => ({
    ...post,
    workoutFormat: post.workoutFormat ?? null,
    title: post.name ?? post.workoutType,
    notes: post.caption,
    completedAt: post.occurredAt,
    resultSummary: formatWorkoutResultSummary({
      workoutType: post.workoutType,
      workoutSubtype,
      workoutFormat: post.workoutFormat,
      formatDurationSeconds,
      formatIntervalSeconds,
      formatRounds,
      timeCapSeconds,
      scoreFinished,
      scoreTimeSeconds,
      scoreRounds,
      scoreReps,
      metrics: metricsBySession.get(post.id) ?? [],
      movements: [...(movementsBySession.get(post.id)?.values() ?? [])],
      segments: segmentsBySession.get(post.id) ?? [],
    }),
    ...(input.includeReactionCounts
      ? {
          reactionCounts: {
            fire: fireReactionCount,
            strong: strongReactionCount,
            clap: clapReactionCount,
          },
        }
      : {}),
    ...(input.includeCommentCounts
      ? { commentCount }
      : {}),
  }));

  const postIds = mapped.flatMap((post) => post.communityPostId ? [post.communityPostId] : []);
  const [badgeMap, goalBadgeMap] = await Promise.all([
    listPrBadgesForPosts(postIds),
    listGoalBadgesForPosts(postIds),
  ]);
  return mapped.map((post) => ({
    ...post,
    prBadges: post.communityPostId ? badgeMap.get(post.communityPostId) ?? [] : [],
    goalBadges: post.communityPostId ? goalBadgeMap.get(post.communityPostId) ?? [] : [],
  }));
}

export async function getCommunityWorkoutDetailForMember(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  const database = getDatabase();
  const [post] = await database
    .select({
      communityPostId: schema.communityPosts.id,
      id: schema.workoutSessions.id,
      userId: schema.workoutSessions.userId,
      groupId: schema.communityPosts.groupId,
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
      caption: schema.communityPosts.caption,
      photoPath: schema.communityPosts.photoPath,
      occurredAt: schema.workoutSessions.occurredAt,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      displayName: schema.users.displayName,
      viewerRole: schema.groupMembers.role,
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .innerJoin(
      schema.users,
      eq(schema.workoutSessions.userId, schema.users.id),
    )
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        viewerActiveMembership(input.userId),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
        communityPostVisibleToSql(input.userId, schema.communityPosts.id),
      ),
    )
    .limit(1);

  if (!post) return null;

  const [metrics, segments, movementSetRows, reactionCountRows, viewerReactionRows, prBadgeMap, goalBadgeMap] = await Promise.all([
    database
      .select({
        id: schema.workoutSessionMetrics.id,
        position: schema.workoutSessionMetrics.position,
        metricType: schema.workoutSessionMetrics.metricType,
        label: schema.workoutSessionMetrics.label,
        numericValue: schema.workoutSessionMetrics.numericValue,
        textValue: schema.workoutSessionMetrics.textValue,
        unit: schema.workoutSessionMetrics.unit,
      })
      .from(schema.workoutSessionMetrics)
      .where(
        eq(
          schema.workoutSessionMetrics.workoutSessionId,
          input.workoutSessionId,
        ),
      )
      .orderBy(asc(schema.workoutSessionMetrics.position)),
    database
      .select({
        id: schema.workoutSessionSegments.id,
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
      .where(
        eq(
          schema.workoutSessionSegments.workoutSessionId,
          input.workoutSessionId,
        ),
      )
      .orderBy(asc(schema.workoutSessionSegments.position)),
    database
      .select({
        movementResultId: schema.sessionMovementResults.id,
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
        eq(
          schema.setResults.sessionMovementResultId,
          schema.sessionMovementResults.id,
        ),
      )
      .where(
        eq(
          schema.sessionMovementResults.workoutSessionId,
          input.workoutSessionId,
        ),
      )
      .orderBy(
        asc(schema.sessionMovementResults.position),
        asc(schema.setResults.position),
      ),
    database
      .select({
        reactionType: schema.communityPostReactions.reactionType,
        value: count(),
      })
      .from(schema.communityPostReactions)
      .where(and(
        eq(schema.communityPostReactions.communityPostId, post.communityPostId),
        communityReactionVisibleToSql(input.userId, schema.communityPostReactions.id),
      ))
      .groupBy(schema.communityPostReactions.reactionType),
    database
      .select({ reactionType: schema.communityPostReactions.reactionType })
      .from(schema.communityPostReactions)
      .where(
        and(
          eq(schema.communityPostReactions.communityPostId, post.communityPostId),
          eq(schema.communityPostReactions.userId, input.userId),
        ),
      )
      .limit(1),
    listPrBadgesForPosts([post.communityPostId]),
    listGoalBadgesForPosts([post.communityPostId]),
  ]);

  const movements = new Map<
    string,
    {
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
    }
  >();

  for (const row of movementSetRows) {
    let movement = movements.get(row.movementResultId);
    if (!movement) {
      movement = {
        id: row.movementResultId,
        movementId: row.movementId,
        movementName: row.movementName,
        position: row.movementPosition,
        notes: row.movementNotes,
        sets: [],
      };
      movements.set(row.movementResultId, movement);
    }

    if (row.setId && row.setPosition != null && row.completed != null) {
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
        completed: row.completed,
        notes: row.setNotes,
      });
    }
  }

  const summaryMovements = [...movements.values()].map((movement) => ({
    movementName: movement.movementName,
    sets: movement.sets.map((set) => ({
      reps: set.reps,
      load: set.load,
      loadUnit: set.loadUnit,
    })),
  }));
  const formatColumns = {
    workoutFormat: post.workoutFormat ?? null,
    formatDurationSeconds: post.formatDurationSeconds,
    formatIntervalSeconds: post.formatIntervalSeconds,
    formatRounds: post.formatRounds,
    timeCapSeconds: post.timeCapSeconds,
    scoreFinished: post.scoreFinished,
    scoreTimeSeconds: post.scoreTimeSeconds,
    scoreRounds: post.scoreRounds,
    scoreReps: post.scoreReps,
  };
  const format = columnsToFormat(formatColumns);
  const detailMovements = [...movements.values()];

  return {
    communityPostId: post.communityPostId,
    id: post.id,
    userId: post.userId,
    groupId: post.groupId,
    workoutType: post.workoutType,
    workoutSubtype: post.workoutSubtype,
    name: post.name,
    durationMinutes: post.durationMinutes,
    effort: post.effort,
    caption: post.caption,
    photoPath: post.photoPath,
    occurredAt: post.occurredAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    displayName: post.displayName,
    viewerRole: post.viewerRole,
    workoutFormat: post.workoutFormat ?? null,
    title: post.name ?? post.workoutType,
    notes: post.caption,
    completedAt: post.occurredAt,
    format,
    logVersion: deriveLogVersion({
      workoutType: post.workoutType,
      workoutFormat: post.workoutFormat ?? null,
      metrics,
      movements: detailMovements,
    }),
    resultSummary: formatWorkoutResultSummary({
      workoutType: post.workoutType,
      workoutSubtype: post.workoutSubtype,
      ...formatColumns,
      metrics,
      movements: summaryMovements,
      segments,
    }),
    metrics: format ? derivedDisplayMetrics(format, post.id) : metrics,
    movements: detailMovements,
    segments,
    reactions: buildReactionSummary(
      reactionCountRows,
      viewerReactionRows[0]?.reactionType ?? null,
    ),
    prBadges: prBadgeMap.get(post.communityPostId) ?? [],
    goalBadges: goalBadgeMap.get(post.communityPostId) ?? [],
  };
}

export async function getWorkoutEditStateForOwner(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  const database = getDatabase();
  const [owned] = await database
    .select({
      workoutType: schema.workoutSessions.workoutType,
      workoutFormat: schema.workoutSessions.workoutFormat,
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
      eq(schema.communityPosts.userId, input.userId),
      eq(schema.workoutSessions.userId, input.userId),
    ))
    .limit(1);

  if (!owned) return null;

  const [meterMetric] = await database
    .select({ id: schema.workoutSessionMetrics.id })
    .from(schema.workoutSessionMetrics)
    .where(and(
      eq(schema.workoutSessionMetrics.workoutSessionId, input.workoutSessionId),
      eq(schema.workoutSessionMetrics.metricType, "distance"),
      eq(schema.workoutSessionMetrics.unit, "m"),
    ))
    .limit(1);

  const [meterSet] = meterMetric
    ? [meterMetric]
    : await database
      .select({ id: schema.setResults.id })
      .from(schema.setResults)
      .innerJoin(
        schema.sessionMovementResults,
        eq(
          schema.setResults.sessionMovementResultId,
          schema.sessionMovementResults.id,
        ),
      )
      .where(and(
        eq(schema.sessionMovementResults.workoutSessionId, input.workoutSessionId),
        eq(schema.setResults.distanceUnit, "m"),
      ))
      .limit(1);

  return {
    workoutType: owned.workoutType,
    workoutFormat: owned.workoutFormat ?? null,
    hasMeterDistance: Boolean(meterMetric || meterSet),
  };
}

export async function setCommunityPostReactionForMember(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
  reactionType: (typeof schema.communityPostReactionTypes)[number];
}) {
  return getDatabase().transaction(async (transaction) => {
    const post = await getAuthorizedCommunityPost(transaction, input);
    if (!post) return null;

    const now = new Date();
    const [reaction] = await transaction
      .insert(schema.communityPostReactions)
      .values({
        id: randomUUID(),
        communityPostId: post.id,
        userId: input.userId,
        reactionType: input.reactionType,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.communityPostReactions.communityPostId,
          schema.communityPostReactions.userId,
        ],
        set: { reactionType: input.reactionType, updatedAt: now },
      })
      .returning({ reactionType: schema.communityPostReactions.reactionType });

    const countRows = await getReactionCounts(transaction, post.id, input.userId);
    return buildReactionSummary(
      countRows,
      reaction?.reactionType ?? input.reactionType,
    );
  });
}

export async function removeCommunityPostReactionForMember(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const post = await getAuthorizedCommunityPost(transaction, input);
    if (!post) return null;

    await transaction
      .delete(schema.communityPostReactions)
      .where(
        and(
          eq(schema.communityPostReactions.communityPostId, post.id),
          eq(schema.communityPostReactions.userId, input.userId),
        ),
      );

    const countRows = await getReactionCounts(transaction, post.id, input.userId);
    return buildReactionSummary(countRows, null);
  });
}

export async function listCommunityPostCommentsForMember(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  const database = getDatabase();
  const post = await getAuthorizedCommunityPost(database, input);
  if (!post) return null;

  return database
    .select({
      id: schema.communityPostComments.id,
      userId: schema.communityPostComments.userId,
      displayName: schema.users.displayName,
      text: schema.communityPostComments.text,
      createdAt: schema.communityPostComments.createdAt,
      updatedAt: schema.communityPostComments.updatedAt,
    })
    .from(schema.communityPostComments)
    .innerJoin(
      schema.users,
      eq(schema.communityPostComments.userId, schema.users.id),
    )
    .where(and(
      eq(schema.communityPostComments.communityPostId, post.id),
      communityCommentVisibleToSql(input.userId, schema.communityPostComments.id),
    ))
    .orderBy(
      asc(schema.communityPostComments.createdAt),
      asc(schema.communityPostComments.id),
    );
}

export async function createCommunityPostCommentForMember(input: {
  userId: string;
  displayName: string;
  groupId: string;
  workoutSessionId: string;
  text: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const post = await getAuthorizedCommunityPost(transaction, input);
    if (!post) return null;

    const now = new Date();
    const [comment] = await transaction
      .insert(schema.communityPostComments)
      .values({
        id: randomUUID(),
        communityPostId: post.id,
        userId: input.userId,
        text: input.text,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: schema.communityPostComments.id,
        userId: schema.communityPostComments.userId,
        text: schema.communityPostComments.text,
        createdAt: schema.communityPostComments.createdAt,
        updatedAt: schema.communityPostComments.updatedAt,
      });

    if (!comment) throw new Error("Community comment could not be created");
    return { ...comment, displayName: input.displayName };
  });
}

async function getAuthorizedCommunityPost(
  database: Database | DatabaseTransaction,
  input: { userId: string; groupId: string; workoutSessionId: string },
) {
  const [post] = await database
    .select({ id: schema.communityPosts.id })
    .from(schema.communityPosts)
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
        communityPostVisibleToSql(input.userId, schema.communityPosts.id),
      ),
    )
    .limit(1);

  return post ?? null;
}

async function getReactionCounts(
  transaction: DatabaseTransaction,
  communityPostId: string,
  viewerId: string,
) {
  return transaction
    .select({
      reactionType: schema.communityPostReactions.reactionType,
      value: count(),
    })
    .from(schema.communityPostReactions)
    .where(and(
      eq(schema.communityPostReactions.communityPostId, communityPostId),
      communityReactionVisibleToSql(viewerId, schema.communityPostReactions.id),
    ))
    .groupBy(schema.communityPostReactions.reactionType);
}

function buildReactionSummary(
  rows: Array<{ reactionType: string; value: number }>,
  viewerReaction: string | null,
) {
  const counts = emptyReactionCounts();
  for (const row of rows) {
    if (isCommunityReactionType(row.reactionType)) {
      counts[row.reactionType] = row.value;
    }
  }

  return {
    counts,
    total: counts.fire + counts.strong + counts.clap,
    viewerReaction: isCommunityReactionType(viewerReaction) ? viewerReaction : null,
  };
}

function emptyReactionCounts() {
  return { fire: 0, strong: 0, clap: 0 };
}

function isCommunityReactionType(
  value: string | null,
): value is (typeof schema.communityPostReactionTypes)[number] {
  return value != null && schema.communityPostReactionTypes.some((type) => type === value);
}

export async function getUserWorkoutSnapshot(input: {
  userId: string;
  todayStart: Date;
  weekStart: Date;
  now: Date;
}) {
  const database = getDatabase();
  const [todaySessions, weekSessions] = await Promise.all([
    database
      .select({
        id: schema.workoutSessions.id,
        userId: schema.workoutSessions.userId,
        workoutType: schema.workoutSessions.workoutType,
        name: schema.workoutSessions.name,
        durationMinutes: schema.workoutSessions.durationMinutes,
        effort: schema.workoutSessions.effort,
        notes: schema.workoutSessions.notes,
        occurredAt: schema.workoutSessions.occurredAt,
        createdAt: schema.workoutSessions.createdAt,
        updatedAt: schema.workoutSessions.updatedAt,
        displayName: schema.users.displayName,
      })
      .from(schema.workoutSessions)
      .innerJoin(
        schema.users,
        eq(schema.workoutSessions.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.workoutSessions.userId, input.userId),
          gte(schema.workoutSessions.occurredAt, input.todayStart),
          lte(schema.workoutSessions.occurredAt, input.now),
        ),
      )
      .orderBy(desc(schema.workoutSessions.occurredAt))
      .limit(1),
    database
      .select({ occurredAt: schema.workoutSessions.occurredAt })
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, input.userId),
          gte(schema.workoutSessions.occurredAt, input.weekStart),
          lte(schema.workoutSessions.occurredAt, input.now),
        ),
      ),
  ]);

  const mostRecentSessionToday = todaySessions[0];
  const mostRecentWorkoutToday = mostRecentSessionToday
    ? {
        ...mostRecentSessionToday,
        // Keep the existing Home response contract while personal history no
        // longer has or depends on a group or Community post.
        groupId: "",
        title:
          mostRecentSessionToday.name ?? mostRecentSessionToday.workoutType,
        caption: null,
        photoPath: null,
        completedAt: mostRecentSessionToday.occurredAt,
      }
    : null;

  return {
    mostRecentWorkoutToday,
    workoutOccurredAtThisWeek: weekSessions.map((session) => session.occurredAt),
    workoutsThisWeek: weekSessions.length,
  };
}

export {
  blockUserForMember,
  createContentReportForMember,
  deleteCommunityCommentForMember,
  listAdminReportQueue,
  listBlockedUsersForMember,
  reviewContentReport,
  softRemoveCommunityPost,
  unblockUserForMember,
} from "./moderation";
export type {
  AdminReportQueueItem,
  ReviewContentReportAction,
  ReviewContentReportResult,
} from "./moderation";

export {
  crewAlertAllowed,
  crewAlertEnabledForUser,
  CrewRequestError,
  getCrewNotificationPrefs,
  leaveCrew,
  listCrewMembers,
  removeCrewMember,
  resetCrewInviteCodeForOwner,
  resolveCrewNotificationPrefs,
  setCrewNotificationPrefs,
  transferCrewOwnership,
  updateCrewForOwner,
  type CrewAlertType,
  type CrewNotificationPrefs,
} from "./crew";

export {
  claimReactionPushSlot,
  countVisibleReactors,
  disableDevicePushTokens,
  listActivePushTokensForUsers,
  listCrewWorkoutPushRecipients,
  listPostAuthorPushRecipient,
  removeDevicePushToken,
  upsertDevicePushToken,
  type CrewPushRecipient,
} from "./push";

export {
  answerPersonalRecordPrompts,
  detectPersonalRecordsForSession,
  restoreCommunityPostPrBadges,
  removeCommunityPostPrBadges,
  shareSessionPersonalRecords,
} from "./personal-records";

export {
  archiveGoalForUser,
  createGoalForUser,
  deleteGoalForUser,
  evaluateGoalsForSession,
  getGoalForUser,
  GOAL_CAP_MESSAGE,
  GOAL_HAND_MARK_SHARE_MESSAGE,
  GOAL_REOPEN_CAP_MESSAGE,
  GOAL_STALE_MESSAGE,
  GOAL_SHARE_UNAVAILABLE_MESSAGE,
  GOAL_TIMEZONE_LOCKED_MESSAGE,
  GOAL_TIMEZONE_MESSAGE,
  GoalRequestError,
  listGoalBadgesForPosts,
  listGoalsForUser,
  lockUserGoals,
  markGoalDoneForUser,
  recomputeGoalsForUser,
  removeCommunityPostGoalBadges,
  reopenGoalForUser,
  restoreCommunityPostGoalBadges,
  shareSessionGoalBadges,
  updateGoalForUser,
} from "./goals";

export {
  blockMovements,
  communityPostComments,
  communityPostGoals,
  communityPostPrs,
  communityPostReactions,
  communityPosts,
  contentReports,
  crewNotificationPrefs,
  devicePushTokens,
  groupMembers,
  goalPeriods,
  goals,
  groups,
  movements,
  personalRecords,
  sessionMovementResults,
  setResults,
  userBlocks,
  users,
  workouts,
  workoutBlocks,
  workoutDefinitions,
  workoutSessionMetrics,
  workoutSessionSegments,
  workoutSessions,
} from "./schema";
