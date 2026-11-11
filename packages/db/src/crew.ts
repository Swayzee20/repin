import "server-only";

import { randomBytes } from "node:crypto";

import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";

import {
  crewAlertAllowed,
  defaultCrewNotificationPrefs,
  resolveCrewNotificationPrefs,
  type CrewAlertType,
  type CrewNotificationPrefs,
} from "@repin/validation";

import { getDatabase, type DatabaseTransaction } from "./connection";
import { activeMembership, openGroup } from "./membership";
import * as schema from "./schema";
import { communityPostVisibleToSql } from "./visibility";

export {
  crewAlertAllowed,
  defaultCrewNotificationPrefs,
  resolveCrewNotificationPrefs,
  type CrewAlertType,
  type CrewNotificationPrefs,
};

export class CrewRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CrewRequestError";
    this.statusCode = statusCode;
  }
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

async function requireActiveMembership(
  transaction: DatabaseTransaction,
  input: { groupId: string; userId: string },
) {
  const [membership] = await transaction
    .select({
      role: schema.groupMembers.role,
      ownerId: schema.groups.ownerId,
      closedAt: schema.groups.closedAt,
      name: schema.groups.name,
      photoPath: schema.groups.photoPath,
      inviteCode: schema.groups.inviteCode,
      createdAt: schema.groups.createdAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        eq(schema.groupMembers.userId, input.userId),
        activeMembership,
        openGroup,
      ),
    )
    .limit(1);

  return membership ?? null;
}

async function countActiveMembers(
  transaction: DatabaseTransaction,
  groupId: string,
) {
  const [row] = await transaction
    .select({ value: count() })
    .from(schema.groupMembers)
    .where(
      and(eq(schema.groupMembers.groupId, groupId), activeMembership),
    );
  return row?.value ?? 0;
}

export async function listCrewMembers(input: {
  groupId: string;
  viewerUserId: string;
  weekStart: Date;
  weekEnd: Date;
}) {
  const members = await getDatabase()
    .select({
      userId: schema.groupMembers.userId,
      role: schema.groupMembers.role,
      displayName: schema.users.displayName,
      joinedAt: schema.groupMembers.joinedAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .where(
      and(eq(schema.groupMembers.groupId, input.groupId), activeMembership),
    )
    .orderBy(
      sql`case when ${schema.groupMembers.role} = 'owner' then 0 else 1 end`,
      asc(schema.groupMembers.joinedAt),
      asc(schema.users.displayName),
    );

  if (!members.length) return [];

  const counts = await getDatabase()
    .select({
      userId: schema.communityPosts.userId,
      value: count(),
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        eq(schema.groupMembers.userId, schema.communityPosts.userId),
        activeMembership,
        gte(
          schema.communityPosts.createdAt,
          schema.groupMembers.contentVisibleAfter,
        ),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        gte(schema.communityPosts.createdAt, input.weekStart),
        lt(schema.communityPosts.createdAt, input.weekEnd),
        communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
        inArray(
          schema.communityPosts.userId,
          members.map((member) => member.userId),
        ),
      ),
    )
    .groupBy(schema.communityPosts.userId);

  const byUser = new Map(counts.map((row) => [row.userId, row.value]));
  return members.map((member) => ({
    ...member,
    workoutsThisWeek: byUser.get(member.userId) ?? 0,
  }));
}

export async function getCrewNotificationPrefs(input: {
  userId: string;
  groupId: string;
}) {
  const rows = await getDatabase()
    .select({
      alertType: schema.crewNotificationPrefs.alertType,
      enabled: schema.crewNotificationPrefs.enabled,
    })
    .from(schema.crewNotificationPrefs)
    .where(
      and(
        eq(schema.crewNotificationPrefs.userId, input.userId),
        eq(schema.crewNotificationPrefs.groupId, input.groupId),
      ),
    );

  return resolveCrewNotificationPrefs(rows);
}

export async function setCrewNotificationPrefs(input: {
  userId: string;
  groupId: string;
  prefs: CrewNotificationPrefs;
}) {
  const values = [
    { alertType: "mute_all" as const, enabled: input.prefs.muteAll },
    { alertType: "crew_workout" as const, enabled: input.prefs.crewWorkout },
    { alertType: "crew_comment" as const, enabled: input.prefs.crewComment },
    { alertType: "crew_reaction" as const, enabled: input.prefs.crewReaction },
  ];

  await getDatabase()
    .insert(schema.crewNotificationPrefs)
    .values(
      values.map((row) => ({
        userId: input.userId,
        groupId: input.groupId,
        alertType: row.alertType,
        enabled: row.enabled,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.crewNotificationPrefs.userId,
        schema.crewNotificationPrefs.groupId,
        schema.crewNotificationPrefs.alertType,
      ],
      set: { enabled: sql`excluded.enabled` },
    });

  return input.prefs;
}

/** Future push senders call this. Missing rows default to on. */
export async function crewAlertEnabledForUser(input: {
  userId: string;
  groupId: string;
  alertType: CrewAlertType;
}) {
  const prefs = await getCrewNotificationPrefs(input);
  return crewAlertAllowed(prefs, input.alertType);
}

export async function updateCrewForOwner(input: {
  userId: string;
  groupId: string;
  name?: string;
  photoPath?: string | null;
}) {
  return getDatabase().transaction(async (transaction) => {
    const membership = await requireActiveMembership(transaction, input);
    if (!membership) return null;
    if (membership.role !== "owner") {
      throw new CrewRequestError("Only the owner can edit this crew", 403);
    }

    const patch: {
      name?: string;
      photoPath?: string | null;
    } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.photoPath !== undefined) patch.photoPath = input.photoPath;
    if (Object.keys(patch).length === 0) return membership;

    const [updated] = await transaction
      .update(schema.groups)
      .set(patch)
      .where(eq(schema.groups.id, input.groupId))
      .returning({
        name: schema.groups.name,
        photoPath: schema.groups.photoPath,
      });

    return updated ?? membership;
  });
}

export async function resetCrewInviteCodeForOwner(input: {
  userId: string;
  groupId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const membership = await requireActiveMembership(transaction, input);
    if (!membership) return null;
    if (membership.role !== "owner") {
      throw new CrewRequestError("Only the owner can reset the invite code", 403);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [updated] = await transaction
          .update(schema.groups)
          .set({ inviteCode: generateInviteCode() })
          .where(eq(schema.groups.id, input.groupId))
          .returning({ inviteCode: schema.groups.inviteCode });
        if (!updated) throw new Error("Invite code could not be reset");
        return updated.inviteCode;
      } catch (error) {
        if (!isInviteCodeCollision(error) || attempt === 4) throw error;
      }
    }

    throw new Error("A unique invite code could not be generated");
  });
}

export async function transferCrewOwnership(input: {
  userId: string;
  groupId: string;
  newOwnerId: string;
}) {
  if (input.userId === input.newOwnerId) {
    throw new CrewRequestError("Pick someone else to make owner");
  }

  return getDatabase().transaction(async (transaction) => {
    const membership = await requireActiveMembership(transaction, input);
    if (!membership) return null;
    if (membership.role !== "owner") {
      throw new CrewRequestError("Only the owner can transfer ownership", 403);
    }

    const [target] = await transaction
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.newOwnerId),
          activeMembership,
        ),
      )
      .limit(1)
      .for("update");

    if (!target) {
      throw new CrewRequestError("That member is not in this crew");
    }

    await transaction
      .update(schema.groupMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.userId),
        ),
      );
    await transaction
      .update(schema.groupMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.newOwnerId),
        ),
      );
    await transaction
      .update(schema.groups)
      .set({ ownerId: input.newOwnerId })
      .where(eq(schema.groups.id, input.groupId));

    return { newOwnerId: input.newOwnerId };
  });
}

export async function removeCrewMember(input: {
  userId: string;
  groupId: string;
  memberId: string;
}) {
  if (input.userId === input.memberId) {
    throw new CrewRequestError("Leave the crew instead of removing yourself");
  }

  return getDatabase().transaction(async (transaction) => {
    const membership = await requireActiveMembership(transaction, input);
    if (!membership) return null;
    if (membership.role !== "owner") {
      throw new CrewRequestError("Only the owner can remove members", 403);
    }

    const [target] = await transaction
      .select({
        userId: schema.groupMembers.userId,
        role: schema.groupMembers.role,
        displayName: schema.users.displayName,
      })
      .from(schema.groupMembers)
      .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
      .where(
        and(
          eq(schema.groupMembers.groupId, input.groupId),
          eq(schema.groupMembers.userId, input.memberId),
          activeMembership,
        ),
      )
      .limit(1);

    if (!target) {
      throw new CrewRequestError("That member is not in this crew");
    }
    if (target.role === "owner") {
      throw new CrewRequestError("Transfer ownership before leaving");
    }

    const now = new Date();
    await endMembership(transaction, {
      groupId: input.groupId,
      userId: input.memberId,
      leftAt: now,
    });

    return { displayName: target.displayName };
  });
}

export async function leaveCrew(input: { userId: string; groupId: string }) {
  return getDatabase().transaction(async (transaction) => {
    const membership = await requireActiveMembership(transaction, input);
    if (!membership) return null;

    const memberCount = await countActiveMembers(transaction, input.groupId);
    const now = new Date();

    if (membership.role === "owner" && memberCount > 1) {
      throw new CrewRequestError(
        "Transfer ownership to someone else before you leave",
        409,
      );
    }

    await endMembership(transaction, {
      groupId: input.groupId,
      userId: input.userId,
      leftAt: now,
    });

    if (membership.role === "owner" && memberCount <= 1) {
      await transaction
        .update(schema.groups)
        .set({ closedAt: now })
        .where(eq(schema.groups.id, input.groupId));
      return { closed: true as const };
    }

    return { closed: false as const };
  });
}

async function endMembership(
  transaction: DatabaseTransaction,
  input: { groupId: string; userId: string; leftAt: Date },
) {
  await transaction
    .update(schema.groupMembers)
    .set({ leftAt: input.leftAt })
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        eq(schema.groupMembers.userId, input.userId),
        activeMembership,
      ),
    );
  await transaction
    .delete(schema.crewNotificationPrefs)
    .where(
      and(
        eq(schema.crewNotificationPrefs.groupId, input.groupId),
        eq(schema.crewNotificationPrefs.userId, input.userId),
      ),
    );
}
