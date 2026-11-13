import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseTransaction } from "./connection";
import * as schema from "./schema";

const EVIDENCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Queryable = typeof getDatabase extends () => infer T ? T : never;

export function evidenceRetainUntil(from = new Date()) {
  return new Date(from.getTime() + EVIDENCE_RETENTION_MS);
}

async function snapshotPost(
  transaction: DatabaseTransaction,
  postId: string,
) {
  const [post] = await transaction
    .select({
      id: schema.communityPosts.id,
      kind: schema.communityPosts.kind,
      userId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
      caption: schema.communityPosts.caption,
      photoPath: schema.communityPosts.photoPath,
      publicationId: schema.communityPosts.publicationId,
      createdAt: schema.communityPosts.createdAt,
      editedAt: schema.communityPosts.editedAt,
    })
    .from(schema.communityPosts)
    .where(eq(schema.communityPosts.id, postId))
    .limit(1);
  if (!post) return null;

  let body = post.caption;
  let photos: Array<{ path: string; sortOrder: number; contentType: string }> = [];
  let links: Array<{ url: string; position: number }> = [];
  if (post.publicationId) {
    const [publication] = await transaction
      .select({
        body: schema.generalPublications.body,
        revision: schema.generalPublications.revision,
      })
      .from(schema.generalPublications)
      .where(eq(schema.generalPublications.id, post.publicationId))
      .limit(1);
    body = publication?.body ?? body;
    photos = await transaction
      .select({
        path: schema.generalPublicationPhotos.storagePath,
        sortOrder: schema.generalPublicationPhotos.sortOrder,
        contentType: schema.generalPublicationPhotos.contentType,
      })
      .from(schema.generalPublicationPhotos)
      .where(eq(schema.generalPublicationPhotos.publicationId, post.publicationId));
    links = await transaction
      .select({
        url: schema.generalPublicationLinks.url,
        position: schema.generalPublicationLinks.position,
      })
      .from(schema.generalPublicationLinks)
      .where(eq(schema.generalPublicationLinks.publicationId, post.publicationId));
  } else if (post.photoPath) {
    photos = [{ path: post.photoPath, sortOrder: 0, contentType: "image/jpeg" }];
  }

  return {
    kind: "post" as const,
    postId: post.id,
    postKind: post.kind,
    authorId: post.userId,
    groupId: post.groupId,
    body,
    photos,
    links,
    createdAt: post.createdAt.toISOString(),
    editedAt: post.editedAt?.toISOString() ?? null,
  };
}

async function snapshotComment(
  transaction: DatabaseTransaction,
  commentId: string,
) {
  const [comment] = await transaction
    .select({
      id: schema.communityPostComments.id,
      userId: schema.communityPostComments.userId,
      text: schema.communityPostComments.text,
      createdAt: schema.communityPostComments.createdAt,
      groupId: schema.communityPosts.groupId,
      postId: schema.communityPosts.id,
    })
    .from(schema.communityPostComments)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
    )
    .where(eq(schema.communityPostComments.id, commentId))
    .limit(1);
  if (!comment) return null;
  return {
    kind: "comment" as const,
    commentId: comment.id,
    postId: comment.postId,
    authorId: comment.userId,
    groupId: comment.groupId,
    body: comment.text,
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function captureReportEvidence(
  transaction: DatabaseTransaction,
  input: {
    reportId: string;
    targetType: "post" | "comment";
    targetId: string;
    groupId: string;
    retainUntil?: Date | null;
    authorErasedAt?: Date | null;
  },
) {
  const snapshot = input.targetType === "post"
    ? await snapshotPost(transaction, input.targetId)
    : await snapshotComment(transaction, input.targetId);
  if (!snapshot) return null;

  const mediaPaths = "photos" in snapshot
    ? snapshot.photos.map((photo) => photo.path)
    : [];

  const [row] = await transaction
    .insert(schema.contentReportEvidence)
    .values({
      reportId: input.reportId,
      targetType: input.targetType,
      targetId: input.targetId,
      groupId: input.groupId,
      snapshot,
      mediaPaths,
      retainUntil: input.retainUntil ?? null,
      authorErasedAt: input.authorErasedAt ?? null,
    })
    .onConflictDoNothing({
      target: schema.contentReportEvidence.reportId,
    })
    .returning({ id: schema.contentReportEvidence.id });

  return row ?? null;
}

export async function captureEvidenceForTargets(
  transaction: DatabaseTransaction,
  input: {
    postIds?: string[];
    commentIds?: string[];
    authorErasedAt?: Date | null;
    retainUntil?: Date | null;
  },
) {
  const postIds = input.postIds ?? [];
  const commentIds = input.commentIds ?? [];
  if (!postIds.length && !commentIds.length) return;

  const filters = [
    ...(postIds.length
      ? [and(
          eq(schema.contentReports.targetType, "post"),
          inArray(schema.contentReports.targetId, postIds),
        )]
      : []),
    ...(commentIds.length
      ? [and(
          eq(schema.contentReports.targetType, "comment"),
          inArray(schema.contentReports.targetId, commentIds),
        )]
      : []),
  ];
  if (!filters.length) return;

  const reports = await transaction
    .select({
      id: schema.contentReports.id,
      targetType: schema.contentReports.targetType,
      targetId: schema.contentReports.targetId,
      groupId: schema.contentReports.groupId,
      status: schema.contentReports.status,
      resolvedAt: schema.contentReports.resolvedAt,
    })
    .from(schema.contentReports)
    .where(or(...filters));

  for (const report of reports) {
    const retainUntil = report.resolvedAt
      ? evidenceRetainUntil(report.resolvedAt)
      : (input.retainUntil ?? null);
    await captureReportEvidence(transaction, {
      reportId: report.id,
      targetType: report.targetType as "post" | "comment",
      targetId: report.targetId,
      groupId: report.groupId,
      retainUntil,
      authorErasedAt: input.authorErasedAt ?? null,
    });
  }
}

export async function markEvidenceResolved(
  transaction: DatabaseTransaction,
  reportIds: string[],
  resolvedAt = new Date(),
) {
  if (!reportIds.length) return;
  await transaction
    .update(schema.contentReportEvidence)
    .set({ retainUntil: evidenceRetainUntil(resolvedAt) })
    .where(and(
      inArray(schema.contentReportEvidence.reportId, reportIds),
      isNull(schema.contentReportEvidence.retainUntil),
    ));
}

export async function markEvidenceAuthorErased(
  transaction: DatabaseTransaction,
  userId: string,
  erasedAt = new Date(),
) {
  const reports = await transaction
    .select({ id: schema.contentReports.id })
    .from(schema.contentReports)
    .where(eq(schema.contentReports.targetUserId, userId));
  if (!reports.length) return;
  const retainUntil = evidenceRetainUntil(erasedAt);
  await transaction
    .update(schema.contentReportEvidence)
    .set({
      authorErasedAt: erasedAt,
      retainUntil: sql`coalesce(${schema.contentReportEvidence.retainUntil}, ${retainUntil})`,
    })
    .where(inArray(
      schema.contentReportEvidence.reportId,
      reports.map((report) => report.id),
    ));
}

export async function deleteExpiredReportEvidence(now = new Date()) {
  const deleted = await getDatabase()
    .delete(schema.contentReportEvidence)
    .where(and(
      lte(schema.contentReportEvidence.retainUntil, now),
    ))
    .returning({ id: schema.contentReportEvidence.id });
  return deleted.length;
}

export async function listProtectedMediaPaths(transaction: DatabaseTransaction) {
  const rows = await transaction
    .select({ mediaPaths: schema.contentReportEvidence.mediaPaths })
    .from(schema.contentReportEvidence)
    .where(sql`(
      ${schema.contentReportEvidence.retainUntil} is null
      or ${schema.contentReportEvidence.retainUntil} > now()
    )`);
  return new Set(rows.flatMap((row) => row.mediaPaths ?? []));
}

export type { Queryable };
