import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, sql, type AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import * as schema from "./schema";
import {
  communityCommentVisibleToSql,
  communityReactionVisibleToSql,
} from "./visibility";

type Queryable = Database | DatabaseTransaction;

export type ContentReportTargetType = (typeof schema.contentReportTargetTypes)[number];
export type ContentReportReason = (typeof schema.contentReportReasons)[number];

const reportReasons = new Set<string>(schema.contentReportReasons);

/** Hide an author from a viewer when either person has blocked the other.
 *  Mention and notification queries do not exist yet. When they do, they must
 *  use this so a block in either direction drops that person's activity. */
export function notBlockedAuthor(viewerId: string, authorColumn: AnyColumn) {
  return sql`not exists (
    select 1 from ${schema.userBlocks}
    where (
      ${schema.userBlocks.blockerId} = ${viewerId}
      and ${schema.userBlocks.blockedId} = ${authorColumn}
    ) or (
      ${schema.userBlocks.blockerId} = ${authorColumn}
      and ${schema.userBlocks.blockedId} = ${viewerId}
    )
  )`;
}

export function notReportedContent(
  viewerId: string,
  targetType: ContentReportTargetType,
  targetColumn: AnyColumn,
) {
  return sql`not exists (
    select 1 from ${schema.contentReports}
    where ${schema.contentReports.reporterId} = ${viewerId}
      and ${schema.contentReports.targetType} = ${targetType}
      and ${schema.contentReports.targetId} = ${targetColumn}
  )`;
}

export function visibleReactionCountSql(
  viewerId: string,
  reactionType: (typeof schema.communityPostReactionTypes)[number],
) {
  return sql<number>`(
    select count(*)::int
    from ${schema.communityPostReactions}
    where ${schema.communityPostReactions.communityPostId} = ${schema.communityPosts.id}
      and ${schema.communityPostReactions.reactionType} = ${reactionType}
      and ${communityReactionVisibleToSql(viewerId, schema.communityPostReactions.id)}
  )`.mapWith(Number);
}

export function visibleCommentCountSql(viewerId: string) {
  return sql<number>`(
    select count(*)::int
    from ${schema.communityPostComments}
    where ${schema.communityPostComments.communityPostId} = ${schema.communityPosts.id}
      and ${communityCommentVisibleToSql(viewerId, schema.communityPostComments.id)}
  )`.mapWith(Number);
}

async function resolveOpenReports(
  transaction: DatabaseTransaction,
  input: {
    commentIds?: string[];
    postId?: string;
    resolvedBy: string | null;
    status: "dismissed" | "removed";
  },
) {
  const now = new Date();
  const patch = { status: input.status, resolvedAt: now, resolvedBy: input.resolvedBy };
  if (input.postId) {
    await transaction
      .update(schema.contentReports)
      .set(patch)
      .where(and(
        eq(schema.contentReports.status, "open"),
        eq(schema.contentReports.targetType, "post"),
        eq(schema.contentReports.targetId, input.postId),
      ));
  }
  if (input.commentIds?.length) {
    await transaction
      .update(schema.contentReports)
      .set(patch)
      .where(and(
        eq(schema.contentReports.status, "open"),
        eq(schema.contentReports.targetType, "comment"),
        inArray(schema.contentReports.targetId, input.commentIds),
      ));
  }
}

/** Content deleted before anyone reviews it. The report stays, marked dismissed. */
export async function dismissOpenReportsForCommunityPost(
  transaction: DatabaseTransaction,
  communityPostId: string,
) {
  const comments = await transaction
    .select({ id: schema.communityPostComments.id })
    .from(schema.communityPostComments)
    .where(eq(schema.communityPostComments.communityPostId, communityPostId));
  await resolveOpenReports(transaction, {
    commentIds: comments.map((comment) => comment.id),
    postId: communityPostId,
    resolvedBy: null,
    status: "dismissed",
  });
}

export async function dismissOpenReportsForComment(
  transaction: DatabaseTransaction,
  commentId: string,
) {
  await resolveOpenReports(transaction, {
    commentIds: [commentId],
    resolvedBy: null,
    status: "dismissed",
  });
}

function reportRow(row: {
  id: string;
  groupId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: Date;
}): Extract<ContentReportResult, { ok: true }>["report"] {
  return {
    id: row.id,
    groupId: row.groupId,
    targetType: row.targetType as ContentReportTargetType,
    targetId: row.targetId,
    reason: row.reason as ContentReportReason,
    status: row.status as (typeof schema.contentReportStatuses)[number],
    createdAt: row.createdAt,
  };
}

export async function softRemoveCommunityPost(input: {
  actorId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [post] = await transaction
      .select({ id: schema.communityPosts.id })
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
        sql`${schema.communityPosts.removedAt} is null`,
      ))
      .limit(1);
    if (!post) return null;
    const now = new Date();
    await transaction
      .update(schema.communityPosts)
      .set({ removedAt: now, removedBy: input.actorId, updatedAt: now })
      .where(eq(schema.communityPosts.id, post.id));
    const comments = await transaction
      .select({ id: schema.communityPostComments.id })
      .from(schema.communityPostComments)
      .where(eq(schema.communityPostComments.communityPostId, post.id));
    await resolveOpenReports(transaction, {
      commentIds: comments.map((comment) => comment.id),
      postId: post.id,
      resolvedBy: input.actorId,
      status: "removed",
    });
    return { postId: post.id };
  });
}

async function isGroupMember(
  database: Queryable,
  userId: string,
  groupId: string,
) {
  const [membership] = await database
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .where(and(
      eq(schema.groupMembers.groupId, groupId),
      eq(schema.groupMembers.userId, userId),
    ))
    .limit(1);
  return Boolean(membership);
}

export type ContentReportResult =
  | {
      ok: true;
      report: {
        id: string;
        groupId: string;
        targetType: ContentReportTargetType;
        targetId: string;
        reason: ContentReportReason;
        status: (typeof schema.contentReportStatuses)[number];
        createdAt: Date;
      };
    }
  | { ok: false; reason: "not_member" | "not_found" | "own_content" | "invalid" };

export async function createContentReportForMember(input: {
  userId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ContentReportReason;
  details?: string | null;
  alsoBlock?: boolean;
}): Promise<ContentReportResult & { blocked?: boolean }> {
  if (!reportReasons.has(input.reason)) return { ok: false, reason: "invalid" };
  const details = input.details?.trim() || null;
  if (details && details.length > 500) return { ok: false, reason: "invalid" };
  if (input.reason === "other" && !details) return { ok: false, reason: "invalid" };

  return getDatabase().transaction(async (transaction) => {
    const target = input.targetType === "post"
      ? await resolvePostTarget(transaction, input.userId, input.targetId)
      : await resolveCommentTarget(transaction, input.userId, input.targetId);
    if (!target) return { ok: false, reason: "not_found" };
    if (!await isGroupMember(transaction, input.userId, target.groupId)) {
      return { ok: false, reason: "not_member" };
    }
    if (target.authorId === input.userId) return { ok: false, reason: "own_content" };

    const now = new Date();
    const [created] = await transaction
      .insert(schema.contentReports)
      .values({
        id: randomUUID(),
        reporterId: input.userId,
        groupId: target.groupId,
        targetType: input.targetType,
        targetId: target.targetId,
        targetUserId: target.authorId,
        reason: input.reason,
        details,
        status: "open",
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [
          schema.contentReports.reporterId,
          schema.contentReports.targetType,
          schema.contentReports.targetId,
        ],
      })
      .returning({
        id: schema.contentReports.id,
        groupId: schema.contentReports.groupId,
        targetType: schema.contentReports.targetType,
        targetId: schema.contentReports.targetId,
        reason: schema.contentReports.reason,
        status: schema.contentReports.status,
        createdAt: schema.contentReports.createdAt,
      });
    const report = created ?? await existingReport(transaction, input.userId, input.targetType, target.targetId);
    if (!report) throw new Error("Content report could not be created");
    let blocked = false;
    if (input.alsoBlock) {
      blocked = await blockInside(transaction, input.userId, target.authorId);
    }
    return { ok: true, report: reportRow(report), blocked };
  });
}

async function existingReport(
  transaction: DatabaseTransaction,
  reporterId: string,
  targetType: ContentReportTargetType,
  targetId: string,
) {
  const [existing] = await transaction
    .select({
      id: schema.contentReports.id,
      groupId: schema.contentReports.groupId,
      targetType: schema.contentReports.targetType,
      targetId: schema.contentReports.targetId,
      reason: schema.contentReports.reason,
      status: schema.contentReports.status,
      createdAt: schema.contentReports.createdAt,
    })
    .from(schema.contentReports)
    .where(and(
      eq(schema.contentReports.reporterId, reporterId),
      eq(schema.contentReports.targetType, targetType),
      eq(schema.contentReports.targetId, targetId),
    ))
    .limit(1);
  return existing ?? null;
}

async function blockInside(
  transaction: DatabaseTransaction,
  blockerId: string,
  blockedId: string,
) {
  if (blockerId === blockedId) return false;
  await transaction
    .insert(schema.userBlocks)
    .values({ blockerId, blockedId, createdAt: new Date() })
    .onConflictDoNothing({
      target: [schema.userBlocks.blockerId, schema.userBlocks.blockedId],
    });
  return true;
}

async function resolvePostTarget(
  transaction: DatabaseTransaction,
  _userId: string,
  targetId: string,
) {
  const [byId] = await transaction
    .select({
      targetId: schema.communityPosts.id,
      authorId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
    })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.id, targetId),
      sql`${schema.communityPosts.removedAt} is null`,
    ))
    .limit(1);
  if (byId) return byId;
  const [bySession] = await transaction
    .select({
      targetId: schema.communityPosts.id,
      authorId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
    })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.workoutSessionId, targetId),
      sql`${schema.communityPosts.removedAt} is null`,
    ))
    .limit(1);
  return bySession ?? null;
}

async function resolveCommentTarget(
  transaction: DatabaseTransaction,
  _userId: string,
  commentId: string,
) {
  const [comment] = await transaction
    .select({
      targetId: schema.communityPostComments.id,
      authorId: schema.communityPostComments.userId,
      groupId: schema.communityPosts.groupId,
    })
    .from(schema.communityPostComments)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
    )
    .where(and(
      eq(schema.communityPostComments.id, commentId),
      sql`${schema.communityPostComments.removedAt} is null`,
      sql`${schema.communityPosts.removedAt} is null`,
    ))
    .limit(1);
  return comment ?? null;
}

export async function deleteCommunityCommentForMember(input: {
  userId: string;
  groupId: string;
  commentId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [comment] = await transaction
      .select({
        id: schema.communityPostComments.id,
        userId: schema.communityPostComments.userId,
      })
      .from(schema.communityPostComments)
      .innerJoin(
        schema.communityPosts,
        eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
      )
      .where(and(
        eq(schema.communityPostComments.id, input.commentId),
        eq(schema.communityPosts.groupId, input.groupId),
      ))
      .limit(1);
    if (!comment || comment.userId !== input.userId) return null;
    await dismissOpenReportsForComment(transaction, comment.id);
    await transaction
      .delete(schema.communityPostComments)
      .where(eq(schema.communityPostComments.id, comment.id));
    return { deletedBy: "author" as const };
  });
}

export type BlockUserResult =
  | { ok: true }
  | { ok: false; reason: "self" | "not_found" };

export async function blockUserForMember(input: {
  blockerId: string;
  blockedId: string;
}): Promise<BlockUserResult> {
  if (input.blockerId === input.blockedId) return { ok: false, reason: "self" };
  const database = getDatabase();
  const groups = await database
    .select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.userId, input.blockerId));
  if (!groups.length) return { ok: false, reason: "not_found" };
  const [peer] = await database
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .where(and(
      eq(schema.groupMembers.userId, input.blockedId),
      inArray(schema.groupMembers.groupId, groups.map((group) => group.groupId)),
    ))
    .limit(1);
  if (!peer) return { ok: false, reason: "not_found" };

  await database
    .insert(schema.userBlocks)
    .values({
      blockerId: input.blockerId,
      blockedId: input.blockedId,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.userBlocks.blockerId, schema.userBlocks.blockedId],
    });
  return { ok: true };
}

export async function unblockUserForMember(input: {
  blockerId: string;
  blockedId: string;
}) {
  await getDatabase()
    .delete(schema.userBlocks)
    .where(and(
      eq(schema.userBlocks.blockerId, input.blockerId),
      eq(schema.userBlocks.blockedId, input.blockedId),
    ));
  return { ok: true as const };
}

export async function listBlockedUsersForMember(blockerId: string) {
  return getDatabase()
    .select({
      userId: schema.users.id,
      displayName: schema.users.displayName,
      blockedAt: schema.userBlocks.createdAt,
    })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.userBlocks.blockedId, schema.users.id))
    .where(eq(schema.userBlocks.blockerId, blockerId))
    .orderBy(asc(schema.users.displayName), asc(schema.users.id));
}

export type ReviewContentReportAction = "remove" | "keep" | "restore";

export type ReviewContentReportResult =
  | { ok: true; action: ReviewContentReportAction; targetType: ContentReportTargetType; targetId: string }
  | { ok: false; reason: "not_found" | "invalid" };

export async function reviewContentReport(input: {
  actorId: string;
  reportId: string;
  action: ReviewContentReportAction;
}): Promise<ReviewContentReportResult> {
  return getDatabase().transaction(async (transaction) => {
    const [report] = await transaction
      .select({
        id: schema.contentReports.id,
        targetType: schema.contentReports.targetType,
        targetId: schema.contentReports.targetId,
        status: schema.contentReports.status,
      })
      .from(schema.contentReports)
      .where(eq(schema.contentReports.id, input.reportId))
      .limit(1);
    if (!report) return { ok: false, reason: "not_found" };
    if (report.targetType !== "post" && report.targetType !== "comment") {
      return { ok: false, reason: "invalid" };
    }
    const targetType = report.targetType;
    const targetId = report.targetId;

    if (input.action === "keep") {
      await resolveOpenReports(transaction, {
        ...(targetType === "post" ? { postId: targetId } : { commentIds: [targetId] }),
        resolvedBy: input.actorId,
        status: "dismissed",
      });
      return { ok: true, action: "keep", targetType, targetId };
    }

    if (input.action === "remove") {
      const target = await loadReviewTarget(transaction, targetType, targetId);
      if (!target) {
        await resolveOpenReports(transaction, {
          ...(targetType === "post" ? { postId: targetId } : { commentIds: [targetId] }),
          resolvedBy: input.actorId,
          status: "dismissed",
        });
        return { ok: true, action: "remove", targetType, targetId };
      }
      const now = new Date();
      if (!target.removedAt) {
        if (targetType === "post") {
          await transaction
            .update(schema.communityPosts)
            .set({ removedAt: now, removedBy: input.actorId, updatedAt: now })
            .where(eq(schema.communityPosts.id, targetId));
        } else {
          await transaction
            .update(schema.communityPostComments)
            .set({ removedAt: now, removedBy: input.actorId, updatedAt: now })
            .where(eq(schema.communityPostComments.id, targetId));
        }
      }
      await resolveOpenReports(transaction, {
        ...(targetType === "post" ? { postId: targetId } : { commentIds: [targetId] }),
        resolvedBy: input.actorId,
        status: "removed",
      });
      return { ok: true, action: "remove", targetType, targetId };
    }

    if (report.status !== "removed") return { ok: false, reason: "invalid" };
    const target = await loadReviewTarget(transaction, targetType, targetId);
    if (!target) return { ok: false, reason: "not_found" };
    const now = new Date();
    if (targetType === "post") {
      await transaction
        .update(schema.communityPosts)
        .set({ removedAt: null, removedBy: null, updatedAt: now })
        .where(eq(schema.communityPosts.id, targetId));
    } else {
      await transaction
        .update(schema.communityPostComments)
        .set({ removedAt: null, removedBy: null, updatedAt: now })
        .where(eq(schema.communityPostComments.id, targetId));
    }
    await transaction
      .update(schema.contentReports)
      .set({ status: "open", resolvedAt: null, resolvedBy: null })
      .where(and(
        eq(schema.contentReports.targetType, targetType),
        eq(schema.contentReports.targetId, targetId),
        eq(schema.contentReports.status, "removed"),
      ));
    return { ok: true, action: "restore", targetType, targetId };
  });
}

async function loadReviewTarget(
  transaction: DatabaseTransaction,
  targetType: ContentReportTargetType,
  targetId: string,
) {
  if (targetType === "post") {
    const [post] = await transaction
      .select({
        id: schema.communityPosts.id,
        removedAt: schema.communityPosts.removedAt,
      })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.id, targetId))
      .limit(1);
    return post ?? null;
  }
  const [comment] = await transaction
    .select({
      id: schema.communityPostComments.id,
      removedAt: schema.communityPostComments.removedAt,
    })
    .from(schema.communityPostComments)
    .where(eq(schema.communityPostComments.id, targetId))
    .limit(1);
  return comment ?? null;
}

export type AdminReportQueueStatus = "open" | "removed" | "dismissed";

export type AdminReportEntry = {
  id: string;
  reporterDisplayName: string;
  reason: ContentReportReason;
  details: string | null;
  createdAt: Date;
};

export type AdminReportQueueItem = {
  id: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ContentReportReason;
  authorDisplayName: string;
  groupName: string;
  workoutName: string | null;
  reportCount: number;
  firstReportedAt: Date;
  status: AdminReportQueueStatus;
  resolvedAt: Date | null;
  resolvedByDisplayName: string | null;
  contentRemoved: boolean;
  contentMissing: boolean;
  contentText: string | null;
  photoPath: string | null;
  contentCreatedAt: Date | null;
  reports: AdminReportEntry[];
  authorHistory: {
    displayName: string;
    removedCount: number;
    groupCount: number;
  };
};

export async function listAdminReportQueue(): Promise<AdminReportQueueItem[]> {
  const database = getDatabase();
  const reporters = alias(schema.users, "report_reporters");
  const authors = alias(schema.users, "report_authors");
  const resolvers = alias(schema.users, "report_resolvers");

  const rows = await database
    .select({
      id: schema.contentReports.id,
      reporterName: reporters.displayName,
      groupName: schema.groups.name,
      targetType: schema.contentReports.targetType,
      targetId: schema.contentReports.targetId,
      targetUserId: schema.contentReports.targetUserId,
      authorName: authors.displayName,
      reason: schema.contentReports.reason,
      details: schema.contentReports.details,
      status: schema.contentReports.status,
      createdAt: schema.contentReports.createdAt,
      resolvedAt: schema.contentReports.resolvedAt,
      resolvedByName: resolvers.displayName,
    })
    .from(schema.contentReports)
    .innerJoin(reporters, eq(reporters.id, schema.contentReports.reporterId))
    .innerJoin(authors, eq(authors.id, schema.contentReports.targetUserId))
    .innerJoin(schema.groups, eq(schema.groups.id, schema.contentReports.groupId))
    .leftJoin(resolvers, eq(resolvers.id, schema.contentReports.resolvedBy))
    .orderBy(asc(schema.contentReports.createdAt), asc(schema.contentReports.id));

  const postIds = [...new Set(rows.filter((row) => row.targetType === "post").map((row) => row.targetId))];
  const commentIds = [...new Set(rows.filter((row) => row.targetType === "comment").map((row) => row.targetId))];
  const authorIds = [...new Set(rows.map((row) => row.targetUserId))];

  const [posts, comments, removedPosts, removedComments, memberships] = await Promise.all([
    postIds.length
      ? database
        .select({
          id: schema.communityPosts.id,
          caption: schema.communityPosts.caption,
          photoPath: schema.communityPosts.photoPath,
          createdAt: schema.communityPosts.createdAt,
          removedAt: schema.communityPosts.removedAt,
          workoutName: schema.workoutSessions.name,
          workoutType: schema.workoutSessions.workoutType,
        })
        .from(schema.communityPosts)
        .innerJoin(
          schema.workoutSessions,
          eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
        )
        .where(inArray(schema.communityPosts.id, postIds))
      : Promise.resolve([]),
    commentIds.length
      ? database
        .select({
          id: schema.communityPostComments.id,
          text: schema.communityPostComments.text,
          createdAt: schema.communityPostComments.createdAt,
          removedAt: schema.communityPostComments.removedAt,
          workoutName: schema.workoutSessions.name,
          workoutType: schema.workoutSessions.workoutType,
        })
        .from(schema.communityPostComments)
        .innerJoin(
          schema.communityPosts,
          eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
        )
        .innerJoin(
          schema.workoutSessions,
          eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
        )
        .where(inArray(schema.communityPostComments.id, commentIds))
      : Promise.resolve([]),
    authorIds.length
      ? database
        .select({
          userId: schema.communityPosts.userId,
          total: count(),
        })
        .from(schema.communityPosts)
        .where(and(
          inArray(schema.communityPosts.userId, authorIds),
          sql`${schema.communityPosts.removedAt} is not null`,
        ))
        .groupBy(schema.communityPosts.userId)
      : Promise.resolve([]),
    authorIds.length
      ? database
        .select({
          userId: schema.communityPostComments.userId,
          total: count(),
        })
        .from(schema.communityPostComments)
        .where(and(
          inArray(schema.communityPostComments.userId, authorIds),
          sql`${schema.communityPostComments.removedAt} is not null`,
        ))
        .groupBy(schema.communityPostComments.userId)
      : Promise.resolve([]),
    authorIds.length
      ? database
        .select({
          userId: schema.groupMembers.userId,
          total: count(),
        })
        .from(schema.groupMembers)
        .where(inArray(schema.groupMembers.userId, authorIds))
        .groupBy(schema.groupMembers.userId)
      : Promise.resolve([]),
  ]);

  const postsById = new Map(posts.map((post) => [post.id, post]));
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const removedByAuthor = new Map<string, number>();
  for (const row of removedPosts) {
    removedByAuthor.set(row.userId, (removedByAuthor.get(row.userId) ?? 0) + Number(row.total));
  }
  for (const row of removedComments) {
    removedByAuthor.set(row.userId, (removedByAuthor.get(row.userId) ?? 0) + Number(row.total));
  }
  const groupsByAuthor = new Map(memberships.map((row) => [row.userId, Number(row.total)]));

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.targetType}:${row.targetId}`;
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }

  const items: AdminReportQueueItem[] = [];
  for (const group of grouped.values()) {
    const first = group[0];
    if (!first) continue;
    const target = first.targetType === "post"
      ? postsById.get(first.targetId)
      : commentsById.get(first.targetId);
    const contentRemoved = Boolean(target && "removedAt" in target && target.removedAt);
    const statuses = new Set(group.map((row) => row.status));
    const status: AdminReportQueueStatus = statuses.has("open")
      ? "open"
      : statuses.has("removed")
        ? "removed"
        : "dismissed";
    const resolved = [...group].reverse().find((row) => row.resolvedAt);
    const workoutName = target && "workoutName" in target
      ? (target.workoutName?.trim() || humanizeWorkoutType(target.workoutType))
      : null;
    const removedTotal = removedByAuthor.get(first.targetUserId) ?? 0;

    items.push({
      id: first.id,
      targetType: first.targetType as ContentReportTargetType,
      targetId: first.targetId,
      reason: first.reason as ContentReportReason,
      authorDisplayName: first.authorName,
      groupName: first.groupName,
      workoutName,
      reportCount: group.length,
      firstReportedAt: first.createdAt,
      status,
      resolvedAt: resolved?.resolvedAt ?? null,
      resolvedByDisplayName: resolved?.resolvedByName ?? null,
      contentRemoved,
      contentMissing: !target,
      contentText: target
        ? ("text" in target ? target.text : target.caption)
        : null,
      photoPath: target && "photoPath" in target ? target.photoPath : null,
      contentCreatedAt: target?.createdAt ?? null,
      reports: group.map((row) => ({
        id: row.id,
        reporterDisplayName: row.reporterName,
        reason: row.reason as ContentReportReason,
        details: row.details,
        createdAt: row.createdAt,
      })),
      authorHistory: {
        displayName: first.authorName,
        removedCount: Math.max(0, removedTotal - (contentRemoved ? 1 : 0)),
        groupCount: groupsByAuthor.get(first.targetUserId) ?? 0,
      },
    });
  }

  items.sort((left, right) => {
    if (left.status === "open" && right.status !== "open") return -1;
    if (left.status !== "open" && right.status === "open") return 1;
    if (left.status === "open") {
      return left.firstReportedAt.getTime() - right.firstReportedAt.getTime();
    }
    const leftResolved = left.resolvedAt?.getTime() ?? 0;
    const rightResolved = right.resolvedAt?.getTime() ?? 0;
    return rightResolved - leftResolved || left.firstReportedAt.getTime() - right.firstReportedAt.getTime();
  });

  return items;
}

function humanizeWorkoutType(workoutType: string) {
  return workoutType.replaceAll("_", " ");
}
