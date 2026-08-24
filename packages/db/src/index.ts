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

type Database = ReturnType<typeof drizzle<typeof schema>>;

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

    const [session] = await transaction
      .insert(schema.workoutSessions)
      .values({
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
      })
      .returning();

    if (!session) {
      throw new Error("Workout session could not be created");
    }

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

  return posts.map((post) => ({
    ...post,
    title: post.name ?? post.workoutType,
    notes: post.caption,
    completedAt: post.occurredAt,
  }));
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
  communityPosts,
  groupMembers,
  groups,
  movements,
  users,
  workouts,
  workoutBlocks,
  workoutDefinitions,
  workoutSessions,
} from "./schema";
