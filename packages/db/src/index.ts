import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import {
  formatWorkoutResultSummary,
  type WorkoutResultMovement,
} from "./workout-result-summary";

type Database = ReturnType<typeof drizzle<typeof schema>>;
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface DatabaseGlobals {
  repinDatabase?: Database;
  repinPool?: Pool;
}

const databaseGlobals = globalThis as typeof globalThis & DatabaseGlobals;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

export function getDatabase() {
  if (!databaseGlobals.repinPool) {
    databaseGlobals.repinPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }

  databaseGlobals.repinDatabase ??= drizzle(databaseGlobals.repinPool, {
    schema,
  });

  return databaseGlobals.repinDatabase;
}

export async function checkDatabaseConnection() {
  await getDatabase().execute(sql`select 1`);
}

export async function getOrCreateUser(input: {
  id: string;
  displayName: string;
}) {
  const database = getDatabase();
  const [createdUser] = await database
    .insert(schema.users)
    .values(input)
    .onConflictDoNothing({ target: schema.users.id })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  const [existingUser] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, input.id))
    .limit(1);

  if (!existingUser) {
    throw new Error("Application user could not be loaded");
  }

  return existingUser;
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

export interface CreateWorkoutSessionWithResultsInput {
  session: {
    id?: string;
    userId: string;
    workoutDefinitionId?: string | null;
    workoutType: string;
    name?: string | null;
    durationMinutes?: number | null;
    effort?: number | null;
    occurredAt: Date;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
  metrics?: CreateWorkoutSessionMetricInput[];
  movements?: CreateSessionMovementResultInput[];
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

    return { ...session, metrics, movements };
}

export async function createWorkoutSessionWithResults(
  input: CreateWorkoutSessionWithResultsInput,
) {
  return getDatabase().transaction(async (transaction) => {
    return insertWorkoutSessionWithResults(transaction, input);
  });
}

export async function getWorkoutSessionWithResults(workoutSessionId: string) {
  const database = getDatabase();
  const [session] = await database
    .select()
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, workoutSessionId))
    .limit(1);

  if (!session) return null;

  const [metrics, movements] = await Promise.all([
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

export function searchGroupsForUser(input: {
  userId: string;
  query: string;
  limit?: number;
}) {
  const escapedQuery = input.query.replace(/[\\%_]/g, "\\$&");

  return getDatabase()
    .select(groupPreviewSelection(input.userId))
    .from(schema.groups)
    .leftJoin(
      schema.groupMembers,
      eq(schema.groupMembers.groupId, schema.groups.id),
    )
    .where(ilike(schema.groups.name, `%${escapedQuery}%`))
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
    .leftJoin(
      schema.groupMembers,
      eq(schema.groupMembers.groupId, schema.groups.id),
    )
    .where(eq(schema.groups.inviteCode, input.inviteCode.toUpperCase()))
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
    .where(eq(schema.groups.inviteCode, inviteCode.toUpperCase()))
    .limit(1);

  return group ?? null;
}

export async function joinGroupByInviteCode(input: {
  userId: string;
  inviteCode: string;
}) {
  const group = await getGroupPreviewByInviteCode(input);
  if (!group) return null;
  return joinGroup({ userId: input.userId, groupId: group.id });
}

export async function joinGroup(input: { userId: string; groupId: string }) {
  return getDatabase().transaction(async (transaction) => {
    const [group] = await transaction
      .select({ id: schema.groups.id, name: schema.groups.name })
      .from(schema.groups)
      .where(eq(schema.groups.id, input.groupId))
      .limit(1);

    if (!group) return null;

    const inserted = await transaction
      .insert(schema.groupMembers)
      .values({ groupId: input.groupId, userId: input.userId, role: "member" })
      .onConflictDoNothing()
      .returning({ role: schema.groupMembers.role });

    const [membership, memberTotal] = await Promise.all([
      transaction
        .select({ role: schema.groupMembers.role })
        .from(schema.groupMembers)
        .where(
          and(
            eq(schema.groupMembers.groupId, input.groupId),
            eq(schema.groupMembers.userId, input.userId),
          ),
        )
        .limit(1),
      transaction
        .select({ value: count() })
        .from(schema.groupMembers)
        .where(eq(schema.groupMembers.groupId, input.groupId)),
    ]);

    if (!membership[0]) throw new Error("Group membership could not be loaded");

    return {
      group: {
        ...group,
        memberCount: memberTotal[0]?.value ?? 0,
        isMember: true,
      },
      membership: membership[0],
      alreadyMember: inserted.length === 0,
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
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(eq(schema.groupMembers.userId, userId))
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
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        eq(schema.groupMembers.userId, input.userId),
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
}) {
  return getDatabase().transaction(async (transaction) => {
    const [membership] = await transaction
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.userId),
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

    return {
      id: session.id,
      userId: session.userId,
      groupId: post.groupId,
      workoutType: session.workoutType,
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
    };
  });
}

export async function listRecentWorkoutsForMember(input: {
  userId: string;
  groupId: string;
  limit?: number;
  includeReactionCounts?: boolean;
  includeCommentCounts?: boolean;
}) {
  const database = getDatabase();
  const [membership] = await database
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        eq(schema.groupMembers.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  const posts = await database
    .select({
      communityPostId: schema.communityPosts.id,
      id: schema.workoutSessions.id,
      userId: schema.workoutSessions.userId,
      groupId: schema.communityPosts.groupId,
      workoutType: schema.workoutSessions.workoutType,
      name: schema.workoutSessions.name,
      durationMinutes: schema.workoutSessions.durationMinutes,
      effort: schema.workoutSessions.effort,
      caption: schema.communityPosts.caption,
      photoPath: schema.communityPosts.photoPath,
      occurredAt: schema.workoutSessions.occurredAt,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      displayName: schema.users.displayName,
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
    .where(eq(schema.communityPosts.groupId, input.groupId))
    .orderBy(
      desc(schema.workoutSessions.occurredAt),
      desc(schema.communityPosts.createdAt),
    )
    .limit(input.limit ?? 30);

  if (!posts.length) return [];

  const workoutSessionIds = [...new Set(posts.map((post) => post.id))];
  const [metrics, movementSetRows, reactionCountRows, commentCountRows] = await Promise.all([
    database
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
          workoutSessionIds,
        ),
      )
      .orderBy(
        asc(schema.workoutSessionMetrics.workoutSessionId),
        asc(schema.workoutSessionMetrics.position),
      ),
    database
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
          workoutSessionIds,
        ),
      )
      .orderBy(
        asc(schema.sessionMovementResults.workoutSessionId),
        asc(schema.sessionMovementResults.position),
        asc(schema.setResults.position),
      ),
    input.includeReactionCounts
      ? database
          .select({
            communityPostId: schema.communityPostReactions.communityPostId,
            reactionType: schema.communityPostReactions.reactionType,
            value: count(),
          })
          .from(schema.communityPostReactions)
          .where(
            inArray(
              schema.communityPostReactions.communityPostId,
              posts.map((post) => post.communityPostId),
            ),
          )
          .groupBy(
            schema.communityPostReactions.communityPostId,
            schema.communityPostReactions.reactionType,
          )
      : Promise.resolve([]),
    input.includeCommentCounts
      ? database
          .select({
            communityPostId: schema.communityPostComments.communityPostId,
            value: count(),
          })
          .from(schema.communityPostComments)
          .where(
            inArray(
              schema.communityPostComments.communityPostId,
              posts.map((post) => post.communityPostId),
            ),
          )
          .groupBy(schema.communityPostComments.communityPostId)
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

  const reactionCountsByPost = new Map<string, ReturnType<typeof emptyReactionCounts>>();
  for (const row of reactionCountRows) {
    if (!isCommunityReactionType(row.reactionType)) continue;
    const counts = reactionCountsByPost.get(row.communityPostId) ?? emptyReactionCounts();
    counts[row.reactionType] = row.value;
    reactionCountsByPost.set(row.communityPostId, counts);
  }
  const commentCountsByPost = new Map(
    commentCountRows.map((row) => [row.communityPostId, row.value]),
  );

  return posts.map(({ communityPostId, ...post }) => ({
    ...post,
    title: post.name ?? post.workoutType,
    notes: post.caption,
    completedAt: post.occurredAt,
    resultSummary: formatWorkoutResultSummary({
      workoutType: post.workoutType,
      metrics: metricsBySession.get(post.id) ?? [],
      movements: [...(movementsBySession.get(post.id)?.values() ?? [])],
    }),
    ...(input.includeReactionCounts
      ? { reactionCounts: reactionCountsByPost.get(communityPostId) ?? emptyReactionCounts() }
      : {}),
    ...(input.includeCommentCounts
      ? { commentCount: commentCountsByPost.get(communityPostId) ?? 0 }
      : {}),
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
      name: schema.workoutSessions.name,
      durationMinutes: schema.workoutSessions.durationMinutes,
      effort: schema.workoutSessions.effort,
      caption: schema.communityPosts.caption,
      photoPath: schema.communityPosts.photoPath,
      occurredAt: schema.workoutSessions.occurredAt,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      displayName: schema.users.displayName,
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
        eq(schema.groupMembers.userId, input.userId),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
      ),
    )
    .limit(1);

  if (!post) return null;

  const [metrics, movementSetRows, reactionCountRows, viewerReactionRows] = await Promise.all([
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
      .where(eq(schema.communityPostReactions.communityPostId, post.communityPostId))
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

  return {
    ...post,
    title: post.name ?? post.workoutType,
    notes: post.caption,
    completedAt: post.occurredAt,
    resultSummary: formatWorkoutResultSummary({
      workoutType: post.workoutType,
      metrics,
      movements: summaryMovements,
    }),
    metrics,
    movements: [...movements.values()],
    reactions: buildReactionSummary(
      reactionCountRows,
      viewerReactionRows[0]?.reactionType ?? null,
    ),
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
    await transaction
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
      });

    return getReactionSummary(transaction, post.id, input.userId);
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

    return getReactionSummary(transaction, post.id, input.userId);
  });
}

export async function listCommunityPostCommentsForMember(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  const database = getDatabase();
  const [post] = await database
    .select({ id: schema.communityPosts.id })
    .from(schema.communityPosts)
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        eq(schema.groupMembers.userId, input.userId),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
      ),
    )
    .limit(1);

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
    .where(eq(schema.communityPostComments.communityPostId, post.id))
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
  transaction: DatabaseTransaction,
  input: { userId: string; groupId: string; workoutSessionId: string },
) {
  const [post] = await transaction
    .select({ id: schema.communityPosts.id })
    .from(schema.communityPosts)
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        eq(schema.groupMembers.userId, input.userId),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
      ),
    )
    .limit(1);

  return post ?? null;
}

async function getReactionSummary(
  transaction: DatabaseTransaction,
  communityPostId: string,
  userId: string,
) {
  const [countRows, viewerRows] = await Promise.all([
    transaction
      .select({
        reactionType: schema.communityPostReactions.reactionType,
        value: count(),
      })
      .from(schema.communityPostReactions)
      .where(eq(schema.communityPostReactions.communityPostId, communityPostId))
      .groupBy(schema.communityPostReactions.reactionType),
    transaction
      .select({ reactionType: schema.communityPostReactions.reactionType })
      .from(schema.communityPostReactions)
      .where(
        and(
          eq(schema.communityPostReactions.communityPostId, communityPostId),
          eq(schema.communityPostReactions.userId, userId),
        ),
      )
      .limit(1),
  ]);

  return buildReactionSummary(countRows, viewerRows[0]?.reactionType ?? null);
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
  const [todaySessions, weekCounts] = await Promise.all([
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
      .select({ value: count() })
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
    workoutsThisWeek: weekCounts[0]?.value ?? 0,
  };
}

export {
  blockMovements,
  communityPostComments,
  communityPostReactions,
  communityPosts,
  groupMembers,
  groups,
  movements,
  sessionMovementResults,
  setResults,
  users,
  workouts,
  workoutBlocks,
  workoutDefinitions,
  workoutSessionMetrics,
  workoutSessions,
} from "./schema";
