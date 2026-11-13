import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CommunityFeedItem,
  CommunityReactionCounts,
  GeneralPostDetail,
  GeneralPostFeedItem,
  GeneralPostLink,
  GeneralPostPhoto,
  WorkoutFeedItem,
} from "@repin/types";
import {
  decodeCommunityFeedCursor,
  encodeCommunityFeedCursor,
  extractPublicationUrls,
  GENERAL_POST_CREW_MAX,
  GENERAL_POST_PHOTO_MAX,
  generalPostHasContent,
  type GeneralPostPhotoContentType,
} from "@repin/validation";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDatabase, type Database, type DatabaseTransaction } from "./connection";
import { activeMembership, openGroup } from "./membership";
import {
  visibleCommentCountSql,
  visibleReactionCountSql,
} from "./moderation";
import {
  captureEvidenceForTargets,
  listProtectedMediaPaths,
} from "./report-evidence";
import * as schema from "./schema";
import { communityCommentVisibleToSql, communityPostVisibleToSql } from "./visibility";

const PHOTO_EXT: Record<GeneralPostPhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export class GeneralPostRequestError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "GeneralPostRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type Queryable = Database | DatabaseTransaction;

function emptyReactionCounts(): CommunityReactionCounts {
  return { fire: 0, strong: 0, clap: 0 };
}

export function generalPostStoragePath(input: {
  authorId: string;
  publicationId: string;
  assetId: string;
  contentType: GeneralPostPhotoContentType;
}) {
  return `${input.authorId}/posts/${input.publicationId}/${input.assetId}.${PHOTO_EXT[input.contentType]}`;
}

async function requireActiveMember(
  database: Queryable,
  userId: string,
  groupId: string,
) {
  const [row] = await database
    .select({
      role: schema.groupMembers.role,
      name: schema.groups.name,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(and(
      eq(schema.groupMembers.groupId, groupId),
      eq(schema.groupMembers.userId, userId),
      activeMembership,
      openGroup,
    ))
    .limit(1);
  return row ?? null;
}

export async function createGeneralPublicationDraft(input: { authorId: string }) {
  const now = new Date();
  const [row] = await getDatabase()
    .insert(schema.generalPublications)
    .values({
      id: randomUUID(),
      authorId: input.authorId,
      body: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.generalPublications.id });
  if (!row) throw new Error("Publication could not be created");
  return row;
}

export async function reserveGeneralPostPhoto(input: {
  authorId: string;
  publicationId?: string;
  contentType: GeneralPostPhotoContentType;
  byteSize: number;
}) {
  return getDatabase().transaction(async (transaction) => {
    let publicationId = input.publicationId ?? null;
    if (publicationId) {
      const [owned] = await transaction
        .select({ id: schema.generalPublications.id })
        .from(schema.generalPublications)
        .where(and(
          eq(schema.generalPublications.id, publicationId),
          eq(schema.generalPublications.authorId, input.authorId),
        ))
        .limit(1);
      if (!owned) {
        throw new GeneralPostRequestError("Publication was not found", 404);
      }
    } else {
      const [created] = await transaction
        .insert(schema.generalPublications)
        .values({
          id: randomUUID(),
          authorId: input.authorId,
          body: null,
          revision: 1,
        })
        .returning({ id: schema.generalPublications.id });
      publicationId = created?.id ?? null;
    }
    if (!publicationId) throw new Error("Publication could not be created");

    const existing = await transaction
      .select({ id: schema.generalPublicationUploadReservations.id })
      .from(schema.generalPublicationUploadReservations)
      .where(and(
        eq(schema.generalPublicationUploadReservations.publicationId, publicationId),
        inArray(schema.generalPublicationUploadReservations.status, ["reserved", "uploaded"]),
      ));
    const published = await transaction
      .select({ id: schema.generalPublicationPhotos.id })
      .from(schema.generalPublicationPhotos)
      .where(eq(schema.generalPublicationPhotos.publicationId, publicationId));
    if (existing.length + published.length >= GENERAL_POST_PHOTO_MAX) {
      throw new GeneralPostRequestError("You can add up to 6 photos");
    }

    const assetId = randomUUID();
    const storagePath = generalPostStoragePath({
      authorId: input.authorId,
      publicationId,
      assetId,
      contentType: input.contentType,
    });
    const now = new Date();
    const [row] = await transaction
      .insert(schema.generalPublicationUploadReservations)
      .values({
        publicationId,
        authorId: input.authorId,
        assetId,
        storagePath,
        contentType: input.contentType,
        byteSize: input.byteSize,
        status: "reserved",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      })
      .returning({
        id: schema.generalPublicationUploadReservations.id,
        publicationId: schema.generalPublicationUploadReservations.publicationId,
        assetId: schema.generalPublicationUploadReservations.assetId,
        storagePath: schema.generalPublicationUploadReservations.storagePath,
        contentType: schema.generalPublicationUploadReservations.contentType,
        byteSize: schema.generalPublicationUploadReservations.byteSize,
      });
    if (!row) throw new Error("Upload reservation could not be created");
    return row;
  });
}

export async function completeGeneralPostPhotoReservation(input: {
  authorId: string;
  reservationId: string;
  uploaded: boolean;
}) {
  const [row] = await getDatabase()
    .update(schema.generalPublicationUploadReservations)
    .set({
      status: input.uploaded ? "uploaded" : "failed",
      uploadedAt: input.uploaded ? new Date() : null,
    })
    .where(and(
      eq(schema.generalPublicationUploadReservations.id, input.reservationId),
      eq(schema.generalPublicationUploadReservations.authorId, input.authorId),
      inArray(schema.generalPublicationUploadReservations.status, ["reserved", "failed"]),
    ))
    .returning({
      id: schema.generalPublicationUploadReservations.id,
      publicationId: schema.generalPublicationUploadReservations.publicationId,
      storagePath: schema.generalPublicationUploadReservations.storagePath,
      status: schema.generalPublicationUploadReservations.status,
      contentType: schema.generalPublicationUploadReservations.contentType,
      byteSize: schema.generalPublicationUploadReservations.byteSize,
      assetId: schema.generalPublicationUploadReservations.assetId,
    });
  return row ?? null;
}

export async function getGeneralPostPhotoReservation(input: {
  authorId: string;
  reservationId: string;
}) {
  const [row] = await getDatabase()
    .select({
      id: schema.generalPublicationUploadReservations.id,
      publicationId: schema.generalPublicationUploadReservations.publicationId,
      storagePath: schema.generalPublicationUploadReservations.storagePath,
      status: schema.generalPublicationUploadReservations.status,
      contentType: schema.generalPublicationUploadReservations.contentType,
      byteSize: schema.generalPublicationUploadReservations.byteSize,
      assetId: schema.generalPublicationUploadReservations.assetId,
    })
    .from(schema.generalPublicationUploadReservations)
    .where(and(
      eq(schema.generalPublicationUploadReservations.id, input.reservationId),
      eq(schema.generalPublicationUploadReservations.authorId, input.authorId),
    ))
    .limit(1);
  return row ?? null;
}

async function replacePublicationPhotos(
  transaction: DatabaseTransaction,
  input: {
    publicationId: string;
    authorId: string;
    photoIds: string[];
  },
) {
  if (input.photoIds.length > GENERAL_POST_PHOTO_MAX) {
    throw new GeneralPostRequestError("You can add up to 6 photos");
  }

  const reservations = input.photoIds.length
    ? await transaction
      .select()
      .from(schema.generalPublicationUploadReservations)
      .where(and(
        eq(schema.generalPublicationUploadReservations.publicationId, input.publicationId),
        eq(schema.generalPublicationUploadReservations.authorId, input.authorId),
        inArray(schema.generalPublicationUploadReservations.id, input.photoIds),
      ))
    : [];
  const existingPhotos = input.photoIds.length
    ? await transaction
      .select()
      .from(schema.generalPublicationPhotos)
      .where(and(
        eq(schema.generalPublicationPhotos.publicationId, input.publicationId),
        inArray(schema.generalPublicationPhotos.id, input.photoIds),
      ))
    : [];

  const reservationById = new Map(reservations.map((row) => [row.id, row]));
  const photoById = new Map(existingPhotos.map((row) => [row.id, row]));
  const next: Array<{
    storagePath: string;
    contentType: string;
    byteSize: number;
    consumeId?: string;
  }> = [];

  for (const id of input.photoIds) {
    const reservation = reservationById.get(id);
    if (reservation) {
      if (reservation.status !== "uploaded") {
        throw new GeneralPostRequestError(
          "Wait for every photo to finish uploading.",
          409,
          "upload_pending",
        );
      }
      next.push({
        storagePath: reservation.storagePath,
        contentType: reservation.contentType,
        byteSize: reservation.byteSize,
        consumeId: reservation.id,
      });
      continue;
    }
    const photo = photoById.get(id);
    if (!photo) {
      throw new GeneralPostRequestError("A photo is missing", 400);
    }
    next.push({
      storagePath: photo.storagePath,
      contentType: photo.contentType,
      byteSize: photo.byteSize,
    });
  }

  const protectedPaths = await listProtectedMediaPaths(transaction);
  const previous = await transaction
    .select({ storagePath: schema.generalPublicationPhotos.storagePath })
    .from(schema.generalPublicationPhotos)
    .where(eq(schema.generalPublicationPhotos.publicationId, input.publicationId));
  await transaction
    .delete(schema.generalPublicationPhotos)
    .where(eq(schema.generalPublicationPhotos.publicationId, input.publicationId));

  if (next.length) {
    await transaction.insert(schema.generalPublicationPhotos).values(
      next.map((photo, sortOrder) => ({
        publicationId: input.publicationId,
        storagePath: photo.storagePath,
        sortOrder,
        contentType: photo.contentType,
        byteSize: photo.byteSize,
      })),
    );
  }

  const keep = new Set(next.map((photo) => photo.storagePath));
  const removed = previous
    .map((photo) => photo.storagePath)
    .filter((path) => !keep.has(path) && !protectedPaths.has(path));

  if (next.some((photo) => photo.consumeId)) {
    await transaction
      .update(schema.generalPublicationUploadReservations)
      .set({ status: "consumed" })
      .where(inArray(
        schema.generalPublicationUploadReservations.id,
        next.flatMap((photo) => (photo.consumeId ? [photo.consumeId] : [])),
      ));
  }

  return { removedPaths: removed, photoCount: next.length };
}

async function replacePublicationLinks(
  transaction: DatabaseTransaction,
  publicationId: string,
  body: string | null,
) {
  await transaction
    .delete(schema.generalPublicationLinks)
    .where(eq(schema.generalPublicationLinks.publicationId, publicationId));
  const urls = extractPublicationUrls(body);
  if (!urls.length) return;
  await transaction.insert(schema.generalPublicationLinks).values(
    urls.map((url, position) => ({
      publicationId,
      url,
      position,
    })),
  );
}

export async function publishGeneralPost(input: {
  authorId: string;
  publicationId: string;
  body?: string | null;
  groupIds: string[];
  photoIds: string[];
}) {
  const uniqueGroupIds = [...new Set(input.groupIds)];
  if (uniqueGroupIds.length < 1 || uniqueGroupIds.length > GENERAL_POST_CREW_MAX) {
    throw new GeneralPostRequestError("Pick 1 to 10 crews");
  }

  return getDatabase().transaction(async (transaction) => {
    const [publication] = await transaction
      .select()
      .from(schema.generalPublications)
      .where(and(
        eq(schema.generalPublications.id, input.publicationId),
        eq(schema.generalPublications.authorId, input.authorId),
      ))
      .limit(1);
    if (!publication) {
      throw new GeneralPostRequestError("Publication was not found", 404);
    }

    const existingCopies = await transaction
      .select({ id: schema.communityPosts.id })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.publicationId, input.publicationId));
    if (existingCopies.length) {
      throw new GeneralPostRequestError("This post is already published", 409);
    }

    const memberships = await transaction
      .select({
        groupId: schema.groupMembers.groupId,
        name: schema.groups.name,
      })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
      .where(and(
        eq(schema.groupMembers.userId, input.authorId),
        activeMembership,
        openGroup,
        inArray(schema.groupMembers.groupId, uniqueGroupIds),
      ));
    if (memberships.length !== uniqueGroupIds.length) {
      throw new GeneralPostRequestError("Pick crews you belong to", 403);
    }

    const photos = await replacePublicationPhotos(transaction, {
      publicationId: input.publicationId,
      authorId: input.authorId,
      photoIds: input.photoIds,
    });
    const body = input.body?.trim() ? input.body : null;
    if (!generalPostHasContent({ body, photoCount: photos.photoCount })) {
      throw new GeneralPostRequestError("Write something or add a photo to post.");
    }

    const now = new Date();
    await transaction
      .update(schema.generalPublications)
      .set({ body, updatedAt: now, revision: 1 })
      .where(eq(schema.generalPublications.id, input.publicationId));
    await replacePublicationLinks(transaction, input.publicationId, body);

    const posts = await transaction
      .insert(schema.communityPosts)
      .values(uniqueGroupIds.map((groupId) => ({
        userId: input.authorId,
        groupId,
        kind: "general" as const,
        publicationId: input.publicationId,
        workoutSessionId: null,
        createdAt: now,
        updatedAt: now,
      })))
      .returning({
        id: schema.communityPosts.id,
        groupId: schema.communityPosts.groupId,
        createdAt: schema.communityPosts.createdAt,
      });

    return {
      publicationId: input.publicationId,
      posts,
      groupNames: memberships.map((row) => ({ groupId: row.groupId, name: row.name })),
      body,
      removedPaths: photos.removedPaths,
    };
  });
}

export async function updateGeneralPostForAuthor(input: {
  authorId: string;
  postId: string;
  expectedRevision: number;
  body?: string | null;
  photoIds?: string[];
}) {
  return getDatabase().transaction(async (transaction) => {
    const [copy] = await transaction
      .select({
        id: schema.communityPosts.id,
        publicationId: schema.communityPosts.publicationId,
        kind: schema.communityPosts.kind,
      })
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.id, input.postId),
        eq(schema.communityPosts.userId, input.authorId),
        eq(schema.communityPosts.kind, "general"),
        isNull(schema.communityPosts.removedAt),
      ))
      .limit(1);
    if (!copy?.publicationId) {
      throw new GeneralPostRequestError("Post was not found", 404);
    }

    const copies = await transaction
      .select({ id: schema.communityPosts.id })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.publicationId, copy.publicationId));
    await captureEvidenceForTargets(transaction, {
      postIds: copies.map((row) => row.id),
    });

    const [publication] = await transaction
      .select()
      .from(schema.generalPublications)
      .where(eq(schema.generalPublications.id, copy.publicationId))
      .limit(1);
    if (!publication) {
      throw new GeneralPostRequestError("Post was not found", 404);
    }
    if (publication.revision !== input.expectedRevision) {
      throw new GeneralPostRequestError("This post was edited somewhere else. Refresh and try again.", 409, "revision");
    }

    const body = input.body === undefined ? publication.body : (input.body?.trim() ? input.body : null);
    let photoCount = (
      await transaction
        .select({ id: schema.generalPublicationPhotos.id })
        .from(schema.generalPublicationPhotos)
        .where(eq(schema.generalPublicationPhotos.publicationId, copy.publicationId))
    ).length;
    let removedPaths: string[] = [];
    if (input.photoIds) {
      const photos = await replacePublicationPhotos(transaction, {
        publicationId: copy.publicationId,
        authorId: input.authorId,
        photoIds: input.photoIds,
      });
      photoCount = photos.photoCount;
      removedPaths = photos.removedPaths;
    }
    if (!generalPostHasContent({ body, photoCount })) {
      throw new GeneralPostRequestError("Write something or add a photo to post.");
    }

    const now = new Date();
    const [updated] = await transaction
      .update(schema.generalPublications)
      .set({
        body,
        revision: publication.revision + 1,
        updatedAt: now,
      })
      .where(and(
        eq(schema.generalPublications.id, copy.publicationId),
        eq(schema.generalPublications.revision, input.expectedRevision),
      ))
      .returning({ revision: schema.generalPublications.revision });
    if (!updated) {
      throw new GeneralPostRequestError("This post was edited somewhere else. Refresh and try again.", 409, "revision");
    }
    await replacePublicationLinks(transaction, copy.publicationId, body);
    await transaction
      .update(schema.communityPosts)
      .set({ editedAt: now, updatedAt: now })
      .where(eq(schema.communityPosts.publicationId, copy.publicationId));

    return { publicationId: copy.publicationId, revision: updated.revision, removedPaths };
  });
}

export async function deleteGeneralPostForAuthor(input: {
  authorId: string;
  postId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [copy] = await transaction
      .select({
        publicationId: schema.communityPosts.publicationId,
      })
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.id, input.postId),
        eq(schema.communityPosts.userId, input.authorId),
        eq(schema.communityPosts.kind, "general"),
      ))
      .limit(1);
    if (!copy?.publicationId) return null;

    const copies = await transaction
      .select({
        id: schema.communityPosts.id,
        groupId: schema.communityPosts.groupId,
      })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.publicationId, copy.publicationId));
    await captureEvidenceForTargets(transaction, {
      postIds: copies.map((row) => row.id),
    });
    const postIds = copies.map((row) => row.id);
    if (postIds.length) {
      await transaction
        .delete(schema.crewPinnedPosts)
        .where(inArray(schema.crewPinnedPosts.postId, postIds));
    }
    const photos = await transaction
      .select({ storagePath: schema.generalPublicationPhotos.storagePath })
      .from(schema.generalPublicationPhotos)
      .where(eq(schema.generalPublicationPhotos.publicationId, copy.publicationId));
    const protectedPaths = await listProtectedMediaPaths(transaction);
    await transaction
      .delete(schema.generalPublications)
      .where(eq(schema.generalPublications.id, copy.publicationId));

    return {
      publicationId: copy.publicationId,
      groupIds: copies.map((row) => row.groupId),
      removedPaths: photos
        .map((photo) => photo.storagePath)
        .filter((path) => !protectedPaths.has(path)),
    };
  });
}

export { clearCrewPinForPosts, clearPinsForAuthorLeave, clearPinsForCrew } from "./pins";

export async function pinGeneralPostForOwner(input: {
  actorId: string;
  postId: string;
  replace?: boolean;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [post] = await transaction
      .select({
        id: schema.communityPosts.id,
        groupId: schema.communityPosts.groupId,
        kind: schema.communityPosts.kind,
        ownerId: schema.groups.ownerId,
      })
      .from(schema.communityPosts)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
      .where(and(
        eq(schema.communityPosts.id, input.postId),
        eq(schema.communityPosts.kind, "general"),
        isNull(schema.communityPosts.removedAt),
        communityPostVisibleToSql(input.actorId, schema.communityPosts.id),
      ))
      .limit(1);
    if (!post) throw new GeneralPostRequestError("Post was not found", 404);
    if (post.ownerId !== input.actorId) {
      throw new GeneralPostRequestError("Only the crew owner can pin a post", 403);
    }

    const [current] = await transaction
      .select({ postId: schema.crewPinnedPosts.postId })
      .from(schema.crewPinnedPosts)
      .where(eq(schema.crewPinnedPosts.groupId, post.groupId))
      .limit(1);

    if (current && current.postId !== post.id && !input.replace) {
      return { needsReplaceConfirm: true as const, groupId: post.groupId, postId: post.id };
    }

    await transaction
      .insert(schema.crewPinnedPosts)
      .values({
        groupId: post.groupId,
        postId: post.id,
        pinnedBy: input.actorId,
        pinnedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.crewPinnedPosts.groupId,
        set: {
          postId: post.id,
          pinnedBy: input.actorId,
          pinnedAt: new Date(),
        },
      });

    return { needsReplaceConfirm: false as const, groupId: post.groupId, postId: post.id };
  });
}

export async function unpinGeneralPostForOwner(input: {
  actorId: string;
  postId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [post] = await transaction
      .select({
        id: schema.communityPosts.id,
        groupId: schema.communityPosts.groupId,
        ownerId: schema.groups.ownerId,
      })
      .from(schema.communityPosts)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
      .where(eq(schema.communityPosts.id, input.postId))
      .limit(1);
    if (!post) throw new GeneralPostRequestError("Post was not found", 404);
    if (post.ownerId !== input.actorId) {
      throw new GeneralPostRequestError("Only the crew owner can unpin a post", 403);
    }
    await transaction
      .delete(schema.crewPinnedPosts)
      .where(and(
        eq(schema.crewPinnedPosts.groupId, post.groupId),
        eq(schema.crewPinnedPosts.postId, post.id),
      ));
    return { groupId: post.groupId, postId: post.id };
  });
}

async function loadPublicationBundle(
  database: Queryable,
  publicationIds: string[],
) {
  if (!publicationIds.length) {
    return {
      publications: new Map<string, { body: string | null; revision: number }>(),
      photos: new Map<string, GeneralPostPhoto[]>(),
      links: new Map<string, GeneralPostLink[]>(),
    };
  }
  const [publicationRows, photoRows, linkRows] = await Promise.all([
    database
      .select({
        id: schema.generalPublications.id,
        body: schema.generalPublications.body,
        revision: schema.generalPublications.revision,
      })
      .from(schema.generalPublications)
      .where(inArray(schema.generalPublications.id, publicationIds)),
    database
      .select({
        id: schema.generalPublicationPhotos.id,
        publicationId: schema.generalPublicationPhotos.publicationId,
        path: schema.generalPublicationPhotos.storagePath,
        sortOrder: schema.generalPublicationPhotos.sortOrder,
        contentType: schema.generalPublicationPhotos.contentType,
      })
      .from(schema.generalPublicationPhotos)
      .where(inArray(schema.generalPublicationPhotos.publicationId, publicationIds))
      .orderBy(asc(schema.generalPublicationPhotos.sortOrder)),
    database
      .select({
        publicationId: schema.generalPublicationLinks.publicationId,
        url: schema.generalPublicationLinks.url,
        previewTitle: schema.generalPublicationLinks.previewTitle,
        previewDescription: schema.generalPublicationLinks.previewDescription,
        previewImageUrl: schema.generalPublicationLinks.previewImageUrl,
      })
      .from(schema.generalPublicationLinks)
      .where(inArray(schema.generalPublicationLinks.publicationId, publicationIds))
      .orderBy(asc(schema.generalPublicationLinks.position)),
  ]);

  const publications = new Map(publicationRows.map((row) => [row.id, row]));
  const photos = new Map<string, GeneralPostPhoto[]>();
  for (const row of photoRows) {
    const list = photos.get(row.publicationId) ?? [];
    list.push({
      id: row.id,
      path: row.path,
      sortOrder: row.sortOrder,
      contentType: row.contentType,
    });
    photos.set(row.publicationId, list);
  }
  const links = new Map<string, GeneralPostLink[]>();
  for (const row of linkRows) {
    const list = links.get(row.publicationId) ?? [];
    list.push({
      url: row.url,
      preview: row.previewTitle || row.previewDescription || row.previewImageUrl
        ? {
            title: row.previewTitle,
            description: row.previewDescription,
            imageUrl: row.previewImageUrl,
          }
        : null,
    });
    links.set(row.publicationId, list);
  }
  return { publications, photos, links };
}

function toGeneralFeedItem(input: {
  id: string;
  publicationId: string;
  userId: string;
  groupId: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  body: string | null;
  revision?: number;
  photos: GeneralPostPhoto[];
  links: GeneralPostLink[];
  fire: number;
  strong: number;
  clap: number;
  commentCount: number;
  destinationCrewNames?: string[];
}): GeneralPostFeedItem {
  return {
    kind: "general",
    id: input.id,
    publicationId: input.publicationId,
    userId: input.userId,
    groupId: input.groupId,
    body: input.body,
    photos: input.photos,
    links: input.links,
    editedAt: input.editedAt?.toISOString() ?? null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    displayName: input.displayName,
    reactionCounts: {
      fire: input.fire,
      strong: input.strong,
      clap: input.clap,
    },
    commentCount: input.commentCount,
    destinationCrewNames: input.destinationCrewNames,
    revision: input.revision,
  };
}

export async function listCommunityFeedForMember(input: {
  viewerUserId: string;
  groupId: string;
  limit?: number;
  cursor?: string;
  includePinned?: boolean;
}) {
  const membership = await requireActiveMember(getDatabase(), input.viewerUserId, input.groupId);
  if (!membership) return null;

  const database = getDatabase();
  const limit = input.limit ?? 20;
  const cursor = decodeCommunityFeedCursor(input.cursor);

  const [pinnedRow] = input.includePinned !== false && !cursor
    ? await database
      .select({
        postId: schema.crewPinnedPosts.postId,
      })
      .from(schema.crewPinnedPosts)
      .where(eq(schema.crewPinnedPosts.groupId, input.groupId))
      .limit(1)
    : [undefined];

  const rows = await database
    .select({
      id: schema.communityPosts.id,
      kind: schema.communityPosts.kind,
      publicationId: schema.communityPosts.publicationId,
      workoutSessionId: schema.communityPosts.workoutSessionId,
      userId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      editedAt: schema.communityPosts.editedAt,
      displayName: schema.users.displayName,
      fireReactionCount: visibleReactionCountSql(input.viewerUserId, "fire"),
      strongReactionCount: visibleReactionCountSql(input.viewerUserId, "strong"),
      clapReactionCount: visibleReactionCountSql(input.viewerUserId, "clap"),
      commentCount: visibleCommentCountSql(input.viewerUserId),
    })
    .from(schema.communityPosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.communityPosts.userId))
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
      pinnedRow?.postId ? sql`${schema.communityPosts.id} <> ${pinnedRow.postId}::uuid` : undefined,
      cursor
        ? or(
            lt(schema.communityPosts.createdAt, cursor.createdAt),
            and(
              eq(schema.communityPosts.createdAt, cursor.createdAt),
              lt(schema.communityPosts.id, cursor.id),
            ),
          )
        : undefined,
    ))
    .orderBy(desc(schema.communityPosts.createdAt), desc(schema.communityPosts.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const next = rows.length > limit ? rows[limit - 1] : null;
  const publicationIds = page
    .flatMap((row) => (row.publicationId ? [row.publicationId] : []));
  const bundle = await loadPublicationBundle(database, publicationIds);

  return {
    crewName: membership.name,
    viewerRole: membership.role,
    pinnedPostId: pinnedRow?.postId ?? null,
    items: page,
    publications: bundle,
    nextCursor: next
      ? encodeCommunityFeedCursor({ createdAt: next.createdAt, id: next.id })
      : null,
  };
}

export async function getPinnedGeneralPostForMember(input: {
  viewerUserId: string;
  groupId: string;
}) {
  const database = getDatabase();
  const [row] = await database
    .select({
      id: schema.communityPosts.id,
      publicationId: schema.communityPosts.publicationId,
      userId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      editedAt: schema.communityPosts.editedAt,
      displayName: schema.users.displayName,
      fireReactionCount: visibleReactionCountSql(input.viewerUserId, "fire"),
      strongReactionCount: visibleReactionCountSql(input.viewerUserId, "strong"),
      clapReactionCount: visibleReactionCountSql(input.viewerUserId, "clap"),
      commentCount: visibleCommentCountSql(input.viewerUserId),
    })
    .from(schema.crewPinnedPosts)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPosts.id, schema.crewPinnedPosts.postId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.communityPosts.userId))
    .where(and(
      eq(schema.crewPinnedPosts.groupId, input.groupId),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
    ))
    .limit(1);
  if (!row?.publicationId) return null;
  const bundle = await loadPublicationBundle(database, [row.publicationId]);
  const publication = bundle.publications.get(row.publicationId);
  return toGeneralFeedItem({
    ...row,
    publicationId: row.publicationId,
    body: publication?.body ?? null,
    revision: publication?.revision,
    photos: bundle.photos.get(row.publicationId) ?? [],
    links: bundle.links.get(row.publicationId) ?? [],
    fire: row.fireReactionCount,
    strong: row.strongReactionCount,
    clap: row.clapReactionCount,
    commentCount: row.commentCount,
  });
}

export function hydrateGeneralFeedItems(
  rows: Array<{
    id: string;
    publicationId: string | null;
    userId: string;
    groupId: string;
    createdAt: Date;
    updatedAt: Date;
    editedAt: Date | null;
    displayName: string;
    fireReactionCount: number;
    strongReactionCount: number;
    clapReactionCount: number;
    commentCount: number;
  }>,
  bundle: Awaited<ReturnType<typeof loadPublicationBundle>>,
): GeneralPostFeedItem[] {
  return rows.flatMap((row) => {
    if (!row.publicationId) return [];
    const publication = bundle.publications.get(row.publicationId);
    return [toGeneralFeedItem({
      ...row,
      publicationId: row.publicationId,
      body: publication?.body ?? null,
      revision: publication?.revision,
      photos: bundle.photos.get(row.publicationId) ?? [],
      links: bundle.links.get(row.publicationId) ?? [],
      fire: row.fireReactionCount,
      strong: row.strongReactionCount,
      clap: row.clapReactionCount,
      commentCount: row.commentCount,
    })];
  });
}

export async function getGeneralPostDetailForMember(input: {
  viewerUserId: string;
  postId: string;
}): Promise<GeneralPostDetail | null> {
  const database = getDatabase();
  const [row] = await database
    .select({
      id: schema.communityPosts.id,
      publicationId: schema.communityPosts.publicationId,
      userId: schema.communityPosts.userId,
      groupId: schema.communityPosts.groupId,
      createdAt: schema.communityPosts.createdAt,
      updatedAt: schema.communityPosts.updatedAt,
      editedAt: schema.communityPosts.editedAt,
      displayName: schema.users.displayName,
      viewerRole: schema.groupMembers.role,
      fireReactionCount: visibleReactionCountSql(input.viewerUserId, "fire"),
      strongReactionCount: visibleReactionCountSql(input.viewerUserId, "strong"),
      clapReactionCount: visibleReactionCountSql(input.viewerUserId, "clap"),
      commentCount: visibleCommentCountSql(input.viewerUserId),
    })
    .from(schema.communityPosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.communityPosts.userId))
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        eq(schema.groupMembers.userId, input.viewerUserId),
        activeMembership,
      ),
    )
    .where(and(
      eq(schema.communityPosts.id, input.postId),
      eq(schema.communityPosts.kind, "general"),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
    ))
    .limit(1);
  if (!row?.publicationId) return null;

  const bundle = await loadPublicationBundle(database, [row.publicationId]);
  const publication = bundle.publications.get(row.publicationId);
  const destinations = row.userId === input.viewerUserId
    ? await listDestinationCrewNames(database, row.publicationId)
    : undefined;

  const comments = await database
    .select({
      id: schema.communityPostComments.id,
      userId: schema.communityPostComments.userId,
      displayName: schema.users.displayName,
      text: schema.communityPostComments.text,
      createdAt: schema.communityPostComments.createdAt,
      updatedAt: schema.communityPostComments.updatedAt,
    })
    .from(schema.communityPostComments)
    .innerJoin(schema.users, eq(schema.users.id, schema.communityPostComments.userId))
    .where(and(
      eq(schema.communityPostComments.communityPostId, row.id),
      communityCommentVisibleToSql(input.viewerUserId, schema.communityPostComments.id),
    ))
    .orderBy(asc(schema.communityPostComments.createdAt), asc(schema.communityPostComments.id));

  const [viewerReaction] = await database
    .select({ reactionType: schema.communityPostReactions.reactionType })
    .from(schema.communityPostReactions)
    .where(and(
      eq(schema.communityPostReactions.communityPostId, row.id),
      eq(schema.communityPostReactions.userId, input.viewerUserId),
    ))
    .limit(1);

  const item = toGeneralFeedItem({
    ...row,
    publicationId: row.publicationId,
    body: publication?.body ?? null,
    revision: publication?.revision,
    photos: bundle.photos.get(row.publicationId) ?? [],
    links: bundle.links.get(row.publicationId) ?? [],
    fire: row.fireReactionCount,
    strong: row.strongReactionCount,
    clap: row.clapReactionCount,
    commentCount: row.commentCount,
    destinationCrewNames: destinations,
  });

  return {
    ...item,
    viewerRole: row.viewerRole,
    reactions: {
      counts: item.reactionCounts ?? emptyReactionCounts(),
      total: (item.reactionCounts?.fire ?? 0)
        + (item.reactionCounts?.strong ?? 0)
        + (item.reactionCounts?.clap ?? 0),
      viewerReaction: (viewerReaction?.reactionType as "fire" | "strong" | "clap" | undefined) ?? null,
    },
    comments: comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })),
  };
}

async function listDestinationCrewNames(database: Queryable, publicationId: string) {
  const rows = await database
    .select({ name: schema.groups.name })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
    .where(eq(schema.communityPosts.publicationId, publicationId))
    .orderBy(asc(schema.groups.name));
  return rows.map((row) => row.name);
}

export async function listDestinationCrewNamesForAuthor(input: {
  authorId: string;
  publicationId: string;
}) {
  const [owned] = await getDatabase()
    .select({ id: schema.generalPublications.id })
    .from(schema.generalPublications)
    .where(and(
      eq(schema.generalPublications.id, input.publicationId),
      eq(schema.generalPublications.authorId, input.authorId),
    ))
    .limit(1);
  if (!owned) return [];
  return listDestinationCrewNames(getDatabase(), input.publicationId);
}

export async function getAuthorizedGeneralPost(
  database: Queryable,
  input: { viewerUserId: string; postId: string },
) {
  const [post] = await database
    .select({
      id: schema.communityPosts.id,
      groupId: schema.communityPosts.groupId,
      userId: schema.communityPosts.userId,
      publicationId: schema.communityPosts.publicationId,
      kind: schema.communityPosts.kind,
      workoutSessionId: schema.communityPosts.workoutSessionId,
    })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.id, input.postId),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
    ))
    .limit(1);
  return post ?? null;
}

export function asCommunityFeedItem(
  workout: WorkoutFeedItem,
): CommunityFeedItem {
  return { ...workout, kind: workout.kind ?? "workout" };
}

export { loadPublicationBundle };
