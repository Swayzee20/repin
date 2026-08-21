import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
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
  durationMinutes: number;
  notes: string | null;
  completedAt: Date;
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

    const [workout] = await transaction
      .insert(schema.workouts)
      .values({
        userId: input.userId,
        groupId: input.groupId,
        workoutType: input.workoutType,
        title: input.title,
        durationMinutes: input.durationMinutes,
        notes: input.notes,
        completedAt: input.completedAt,
      })
      .returning();

    if (!workout) {
      throw new Error("Workout could not be created");
    }

    return { ...workout, displayName: input.displayName };
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

  return database
    .select({
      id: schema.workouts.id,
      userId: schema.workouts.userId,
      groupId: schema.workouts.groupId,
      workoutType: schema.workouts.workoutType,
      title: schema.workouts.title,
      durationMinutes: schema.workouts.durationMinutes,
      notes: schema.workouts.notes,
      completedAt: schema.workouts.completedAt,
      createdAt: schema.workouts.createdAt,
      displayName: schema.users.displayName,
    })
    .from(schema.workouts)
    .innerJoin(schema.users, eq(schema.workouts.userId, schema.users.id))
    .where(eq(schema.workouts.groupId, input.groupId))
    .orderBy(desc(schema.workouts.completedAt), desc(schema.workouts.createdAt))
    .limit(input.limit ?? 30);
}

export async function getUserWorkoutSnapshot(input: {
  userId: string;
  todayStart: Date;
  weekStart: Date;
  now: Date;
}) {
  const database = getDatabase();
  const [todayWorkouts, weekCounts] = await Promise.all([
    database
      .select({
        id: schema.workouts.id,
        userId: schema.workouts.userId,
        groupId: schema.workouts.groupId,
        workoutType: schema.workouts.workoutType,
        title: schema.workouts.title,
        durationMinutes: schema.workouts.durationMinutes,
        notes: schema.workouts.notes,
        completedAt: schema.workouts.completedAt,
        createdAt: schema.workouts.createdAt,
        displayName: schema.users.displayName,
      })
      .from(schema.workouts)
      .innerJoin(schema.users, eq(schema.workouts.userId, schema.users.id))
      .where(
        and(
          eq(schema.workouts.userId, input.userId),
          gte(schema.workouts.completedAt, input.todayStart),
          lte(schema.workouts.completedAt, input.now),
        ),
      )
      .orderBy(desc(schema.workouts.completedAt))
      .limit(1),
    database
      .select({ value: count() })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, input.userId),
          gte(schema.workouts.completedAt, input.weekStart),
          lte(schema.workouts.completedAt, input.now),
        ),
      ),
  ]);

  return {
    mostRecentWorkoutToday: todayWorkouts[0] ?? null,
    workoutsThisWeek: weekCounts[0]?.value ?? 0,
  };
}

export { groupMembers, groups, users, workouts } from "./schema";
