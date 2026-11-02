import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql, type AnyColumn } from "drizzle-orm";

import {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from "./connection";
import * as schema from "./schema";

type Queryable = Database | DatabaseTransaction;

export type ContentReportTargetType = (typeof schema.contentReportTargetTypes)[number];
export type ContentReportReason = (typeof schema.contentReportReasons)[number];

const reportReasons = new Set<string>(schema.contentReportReasons);

export function notBlockedAuthor(viewerId: string, authorColumn: AnyColumn) {
  return sql`not exists (
    select 1 from ${schema.userBlocks}
    where ${schema.userBlocks.blockerId} = ${viewerId}
      and ${schema.userBlocks.blockedId} = ${authorColumn}
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
  viewerId: string | undefined,
  reactionType: (typeof schema.communityPostReactionTypes)[number],
) {
  const hidden = viewerId
    ? sql` and ${notBlockedAuthor(viewerId, schema.communityPostReactions.userId)}`
    : sql``;
  return sql<number>`(
    select count(*)::int
    from ${schema.communityPostReactions}
    where ${schema.communityPostReactions.communityPostId} = ${schema.communityPosts.id}
      and ${schema.communityPostReactions.reactionType} = ${reactionType}
      ${hidden}
  )`.mapWith(Number);
}

export function visibleCommentCountSql(viewerId: string | undefined) {
  const hidden = viewerId
    ? sql` and ${notBlockedAuthor(viewerId, schema.communityPostComments.userId)}
           and ${notReportedContent(viewerId, "comment", schema.communityPostComments.id)}`
    : sql``;
  return sql<number>`(
    select count(*)::int
    from ${schema.communityPostComments}
    where ${schema.communityPostComments.communityPostId} = ${schema.communityPosts.id}
      ${hidden}
  )`.mapWith(Number);
}

export async function closeOpenReportsForCommunityPost(
  transaction: DatabaseTransaction,
  communityPostId: string,
  reviewedBy: string,
) {
  const comments = await transaction
    .select({ id: schema.communityPostComments.id })
    .from(schema.communityPostComments)
    .where(eq(schema.communityPostComments.communityPostId, communityPostId));
  const now = new Date();
  await transaction
    .update(schema.contentReports)
    .set({ status: "removed", reviewedAt: now, reviewedBy })
    .where(and(
      eq(schema.contentReports.status, "open"),
      eq(schema.contentReports.targetType, "post"),
      eq(schema.contentReports.targetId, communityPostId),
    ));
  const commentIds = comments.map((comment) => comment.id);
  if (!commentIds.length) return;
  await transaction
    .update(schema.contentReports)
    .set({ status: "removed", reviewedAt: now, reviewedBy })
    .where(and(
      eq(schema.contentReports.status, "open"),
      eq(schema.contentReports.targetType, "comment"),
      inArray(schema.contentReports.targetId, commentIds),
    ));
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

export async function closeOpenReportsForComment(
  transaction: DatabaseTransaction,
  commentId: string,
  reviewedBy: string,
) {
  await transaction
    .update(schema.contentReports)
    .set({ status: "removed", reviewedAt: new Date(), reviewedBy })
    .where(and(
      eq(schema.contentReports.status, "open"),
      eq(schema.contentReports.targetType, "comment"),
      eq(schema.contentReports.targetId, commentId),
    ));
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

async function isGroupOwner(
  database: Queryable,
  userId: string,
  groupId: string,
) {
  const [membership] = await database
    .select({ role: schema.groupMembers.role })
    .from(schema.groupMembers)
    .where(and(
      eq(schema.groupMembers.groupId, groupId),
      eq(schema.groupMembers.userId, userId),
      eq(schema.groupMembers.role, "owner"),
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
  groupId: string;
  targetType: ContentReportTargetType;
  workoutSessionId?: string;
  commentId?: string;
  reason: ContentReportReason;
  note?: string | null;
}): Promise<ContentReportResult> {
  if (!reportReasons.has(input.reason)) return { ok: false, reason: "invalid" };
  const note = input.note?.trim() || null;
  if (note && note.length > 500) return { ok: false, reason: "invalid" };

  return getDatabase().transaction(async (transaction) => {
    if (!await isGroupMember(transaction, input.userId, input.groupId)) {
      return { ok: false, reason: "not_member" };
    }

    const target = input.targetType === "post"
      ? await resolvePostTarget(transaction, input.groupId, input.workoutSessionId)
      : await resolveCommentTarget(transaction, input.groupId, input.commentId);
    if (!target) return { ok: false, reason: "not_found" };
    if (target.authorId === input.userId) return { ok: false, reason: "own_content" };

    const now = new Date();
    const [created] = await transaction
      .insert(schema.contentReports)
      .values({
        id: randomUUID(),
        reporterId: input.userId,
        groupId: input.groupId,
        targetType: input.targetType,
        targetId: target.targetId,
        reason: input.reason,
        note,
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
    if (created) return { ok: true, report: reportRow(created) };

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
        eq(schema.contentReports.reporterId, input.userId),
        eq(schema.contentReports.targetType, input.targetType),
        eq(schema.contentReports.targetId, target.targetId),
      ))
      .limit(1);
    if (!existing) throw new Error("Content report could not be created");
    return { ok: true, report: reportRow(existing) };
  });
}

async function resolvePostTarget(
  transaction: DatabaseTransaction,
  groupId: string,
  workoutSessionId: string | undefined,
) {
  if (!workoutSessionId) return null;
  const [post] = await transaction
    .select({
      targetId: schema.communityPosts.id,
      authorId: schema.communityPosts.userId,
    })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.groupId, groupId),
      eq(schema.communityPosts.workoutSessionId, workoutSessionId),
    ))
    .limit(1);
  return post ?? null;
}

async function resolveCommentTarget(
  transaction: DatabaseTransaction,
  groupId: string,
  commentId: string | undefined,
) {
  if (!commentId) return null;
  const [comment] = await transaction
    .select({
      targetId: schema.communityPostComments.id,
      authorId: schema.communityPostComments.userId,
    })
    .from(schema.communityPostComments)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
    )
    .where(and(
      eq(schema.communityPostComments.id, commentId),
      eq(schema.communityPosts.groupId, groupId),
    ))
    .limit(1);
  return comment ?? null;
}

export type OpenContentReport = {
  id: string;
  targetType: ContentReportTargetType;
  targetId: string;
  workoutSessionId: string | null;
  reason: ContentReportReason;
  note: string | null;
  createdAt: Date;
  excerpt: string;
  authorDisplayName: string;
  reporterDisplayName: string;
};

export async function listOpenReportsForGroupOwner(input: {
  userId: string;
  groupId: string;
}) {
  const database = getDatabase();
  if (!await isGroupOwner(database, input.userId, input.groupId)) return null;

  const reports = await database
    .select({
      id: schema.contentReports.id,
      targetType: schema.contentReports.targetType,
      targetId: schema.contentReports.targetId,
      reason: schema.contentReports.reason,
      note: schema.contentReports.note,
      createdAt: schema.contentReports.createdAt,
      reporterDisplayName: schema.users.displayName,
    })
    .from(schema.contentReports)
    .innerJoin(schema.users, eq(schema.contentReports.reporterId, schema.users.id))
    .where(and(
      eq(schema.contentReports.groupId, input.groupId),
      eq(schema.contentReports.status, "open"),
    ))
    .orderBy(asc(schema.contentReports.createdAt), asc(schema.contentReports.id));

  if (!reports.length) return [];

  const postIds = reports
    .filter((report) => report.targetType === "post")
    .map((report) => report.targetId);
  const commentIds = reports
    .filter((report) => report.targetType === "comment")
    .map((report) => report.targetId);

  const [posts, comments] = await Promise.all([
    postIds.length
      ? database
          .select({
            id: schema.communityPosts.id,
            workoutSessionId: schema.communityPosts.workoutSessionId,
            caption: schema.communityPosts.caption,
            name: schema.workoutSessions.name,
            authorDisplayName: schema.users.displayName,
          })
          .from(schema.communityPosts)
          .innerJoin(
            schema.workoutSessions,
            eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
          )
          .innerJoin(schema.users, eq(schema.communityPosts.userId, schema.users.id))
          .where(inArray(schema.communityPosts.id, postIds))
      : Promise.resolve([]),
    commentIds.length
      ? database
          .select({
            id: schema.communityPostComments.id,
            text: schema.communityPostComments.text,
            workoutSessionId: schema.communityPosts.workoutSessionId,
            authorDisplayName: schema.users.displayName,
          })
          .from(schema.communityPostComments)
          .innerJoin(
            schema.communityPosts,
            eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
          )
          .innerJoin(schema.users, eq(schema.communityPostComments.userId, schema.users.id))
          .where(inArray(schema.communityPostComments.id, commentIds))
      : Promise.resolve([]),
  ]);

  const postsById = new Map(posts.map((post) => [post.id, post]));
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  return reports.map((report): OpenContentReport => {
    if (report.targetType === "post") {
      const post = postsById.get(report.targetId);
      const excerpt = post?.caption?.trim() || post?.name?.trim() || "Workout post";
      return {
        id: report.id,
        targetType: "post",
        targetId: report.targetId,
        workoutSessionId: post?.workoutSessionId ?? null,
        reason: report.reason as ContentReportReason,
        note: report.note,
        createdAt: report.createdAt,
        excerpt: post ? excerpt : "This content is no longer available.",
        authorDisplayName: post?.authorDisplayName ?? "Unknown",
        reporterDisplayName: report.reporterDisplayName,
      };
    }

    const comment = commentsById.get(report.targetId);
    return {
      id: report.id,
      targetType: "comment",
      targetId: report.targetId,
      workoutSessionId: comment?.workoutSessionId ?? null,
      reason: report.reason as ContentReportReason,
      note: report.note,
      createdAt: report.createdAt,
      excerpt: comment?.text ?? "This content is no longer available.",
      authorDisplayName: comment?.authorDisplayName ?? "Unknown",
      reporterDisplayName: report.reporterDisplayName,
    };
  });
}

export async function dismissContentReportForGroupOwner(input: {
  userId: string;
  groupId: string;
  reportId: string;
}) {
  const database = getDatabase();
  if (!await isGroupOwner(database, input.userId, input.groupId)) return null;
  const [updated] = await database
    .update(schema.contentReports)
    .set({
      status: "dismissed",
      reviewedAt: new Date(),
      reviewedBy: input.userId,
    })
    .where(and(
      eq(schema.contentReports.id, input.reportId),
      eq(schema.contentReports.groupId, input.groupId),
      eq(schema.contentReports.status, "open"),
    ))
    .returning({
      id: schema.contentReports.id,
      status: schema.contentReports.status,
    });
  return updated ?? null;
}

export async function removeCommunityPostForGroupOwner(input: {
  userId: string;
  groupId: string;
  workoutSessionId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    if (!await isGroupOwner(transaction, input.userId, input.groupId)) return null;
    const [post] = await transaction
      .select({
        id: schema.communityPosts.id,
        photoPath: schema.communityPosts.photoPath,
      })
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.workoutSessionId),
      ))
      .limit(1);
    if (!post) return null;
    await closeOpenReportsForCommunityPost(transaction, post.id, input.userId);
    await transaction
      .delete(schema.communityPosts)
      .where(eq(schema.communityPosts.id, post.id));
    return { photoPaths: post.photoPath ? [post.photoPath] : [] };
  });
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
    if (!comment) return null;
    const isAuthor = comment.userId === input.userId;
    const isOwner = await isGroupOwner(transaction, input.userId, input.groupId);
    if (!isAuthor && !isOwner) return null;
    await closeOpenReportsForComment(transaction, comment.id, input.userId);
    await transaction
      .delete(schema.communityPostComments)
      .where(eq(schema.communityPostComments.id, comment.id));
    return { deletedBy: isAuthor ? "author" as const : "owner" as const };
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
