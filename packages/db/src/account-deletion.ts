import "server-only";

import { resolveUserDisplayName } from "@repin/types";
import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { getDatabase, type Database, type DatabaseTransaction } from "./connection";
import { lockUserGoals } from "./goals";
import { activeMembership } from "./membership";
import {
  captureEvidenceForTargets,
  evidenceRetainUntil,
  listProtectedMediaPaths,
  markEvidenceAuthorErased,
} from "./report-evidence";
import * as schema from "./schema";

type Queryable = Database | DatabaseTransaction;

export type AccountDeletionPreviewCrew = {
  groupId: string;
  name: string;
  closes: boolean;
  successorDisplayName: string | null;
};

export type AccountDeletionStoragePlan = {
  protectedMediaPaths: string[];
  closedCrewPhotoPaths: string[];
  closedCrewIds: string[];
};

export async function findOwnershipSuccessor(
  queryable: Queryable,
  groupId: string,
  ownerId: string,
) {
  const [successor] = await queryable
    .select({
      userId: schema.groupMembers.userId,
      displayName: schema.users.displayName,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.groupMembers.userId))
    .where(and(
      eq(schema.groupMembers.groupId, groupId),
      ne(schema.groupMembers.userId, ownerId),
      activeMembership,
    ))
    .orderBy(asc(schema.groupMembers.joinedAt), asc(schema.groupMembers.userId))
    .limit(1);

  return successor ?? null;
}

export async function previewAccountDeletion(userId: string): Promise<{
  crews: AccountDeletionPreviewCrew[];
}> {
  const database = getDatabase();
  const owned = await database
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
    })
    .from(schema.groups)
    .where(eq(schema.groups.ownerId, userId))
    .orderBy(asc(schema.groups.name), asc(schema.groups.id));

  const crews: AccountDeletionPreviewCrew[] = [];
  for (const group of owned) {
    const successor = await findOwnershipSuccessor(database, group.id, userId);
    crews.push({
      groupId: group.id,
      name: group.name,
      closes: !successor,
      successorDisplayName: successor
        ? resolveUserDisplayName({ displayName: successor.displayName })
        : null,
    });
  }
  return { crews };
}

export async function dismissOwnerNotice(input: { userId: string; groupId: string }) {
  const [row] = await getDatabase()
    .update(schema.groupMembers)
    .set({ ownerNoticeAt: null })
    .where(and(
      eq(schema.groupMembers.groupId, input.groupId),
      eq(schema.groupMembers.userId, input.userId),
      activeMembership,
    ))
    .returning({ groupId: schema.groupMembers.groupId });
  return Boolean(row);
}

export async function captureOwnedContentEvidence(
  transaction: DatabaseTransaction,
  userId: string,
  erasedAt = new Date(),
) {
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
  await captureEvidenceForTargets(transaction, {
    postIds: ownedPosts.map((post) => post.id),
    commentIds: ownedComments.map((comment) => comment.id),
    authorErasedAt: erasedAt,
    retainUntil: evidenceRetainUntil(erasedAt),
  });
  await markEvidenceAuthorErased(transaction, userId, erasedAt);
}

export async function listAccountDeletionStoragePlan(
  userId: string,
): Promise<AccountDeletionStoragePlan> {
  return getDatabase().transaction(async (transaction) => {
    await lockUserGoals(transaction, userId);
    const [existingUser] = await transaction
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!existingUser) {
      return { protectedMediaPaths: [], closedCrewPhotoPaths: [], closedCrewIds: [] };
    }

    await captureOwnedContentEvidence(transaction, userId);
    const protectedMediaPaths = [...await listProtectedMediaPaths(transaction)];
    const ownedGroups = await transaction
      .select({
        id: schema.groups.id,
        photoPath: schema.groups.photoPath,
      })
      .from(schema.groups)
      .where(eq(schema.groups.ownerId, userId))
      .orderBy(asc(schema.groups.id));

    const closedCrewIds: string[] = [];
    const closedCrewPhotoPaths: string[] = [];

    for (const group of ownedGroups) {
      const successor = await findOwnershipSuccessor(transaction, group.id, userId);
      if (successor) continue;
      closedCrewIds.push(group.id);
      if (group.photoPath) closedCrewPhotoPaths.push(group.photoPath);

      const postPhotos = await transaction
        .select({ photoPath: schema.communityPosts.photoPath })
        .from(schema.communityPosts)
        .where(and(
          eq(schema.communityPosts.groupId, group.id),
          isNotNull(schema.communityPosts.photoPath),
        ));
      for (const photo of postPhotos) {
        if (photo.photoPath) closedCrewPhotoPaths.push(photo.photoPath);
      }

      const publicationPhotos = await transaction
        .select({ storagePath: schema.generalPublicationPhotos.storagePath })
        .from(schema.generalPublicationPhotos)
        .innerJoin(
          schema.communityPosts,
          eq(schema.communityPosts.publicationId, schema.generalPublicationPhotos.publicationId),
        )
        .where(eq(schema.communityPosts.groupId, group.id));
      for (const photo of publicationPhotos) {
        closedCrewPhotoPaths.push(photo.storagePath);
      }
    }

    return {
      protectedMediaPaths,
      closedCrewPhotoPaths: [...new Set(closedCrewPhotoPaths)],
      closedCrewIds,
    };
  });
}

export async function listNewOwnerHandoverTargets(
  transfers: Array<{ groupId: string; newOwnerId: string }>,
) {
  if (!transfers.length) return [];
  const database = getDatabase();
  const groupIds = [...new Set(transfers.map((row) => row.groupId))];
  const groups = await database
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
    })
    .from(schema.groups)
    .where(inArray(schema.groups.id, groupIds));
  const nameById = new Map(groups.map((group) => [group.id, group.name]));
  const targets = [];
  for (const transfer of transfers) {
    const prefs = await database
      .select({
        alertType: schema.crewNotificationPrefs.alertType,
        enabled: schema.crewNotificationPrefs.enabled,
      })
      .from(schema.crewNotificationPrefs)
      .where(and(
        eq(schema.crewNotificationPrefs.userId, transfer.newOwnerId),
        eq(schema.crewNotificationPrefs.groupId, transfer.groupId),
      ));
    const muteAll = prefs.some((row) => row.alertType === "mute_all" && row.enabled);
    targets.push({
      groupId: transfer.groupId,
      newOwnerId: transfer.newOwnerId,
      groupName: nameById.get(transfer.groupId) ?? "crew",
      muteAll,
    });
  }
  return targets;
}
