import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { DatabaseTransaction } from "./connection";
import * as schema from "./schema";

export async function clearCrewPinForPosts(
  transaction: DatabaseTransaction,
  postIds: string[],
) {
  if (!postIds.length) return;
  await transaction
    .delete(schema.crewPinnedPosts)
    .where(inArray(schema.crewPinnedPosts.postId, postIds));
}

export async function clearPinsForAuthorLeave(
  transaction: DatabaseTransaction,
  input: { groupId: string; userId: string },
) {
  const authored = await transaction
    .select({ id: schema.communityPosts.id })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      eq(schema.communityPosts.userId, input.userId),
    ));
  await clearCrewPinForPosts(transaction, authored.map((row) => row.id));
}

export async function clearPinsForCrew(transaction: DatabaseTransaction, groupId: string) {
  await transaction
    .delete(schema.crewPinnedPosts)
    .where(eq(schema.crewPinnedPosts.groupId, groupId));
}

// Pins this user made on someone else's post keep the post on the crew board.
// After ownership handover, attribute those pins to the crew's current owner.
// A crew that is closing has already dropped its pin (or we delete it here if
// the current owner is still the departing user). Pins on the user's own posts
// stay put so deleting those posts can cascade them as before.
export async function reassignOrClearPinsByUser(
  transaction: DatabaseTransaction,
  userId: string,
) {
  const pins = await transaction
    .select({
      groupId: schema.crewPinnedPosts.groupId,
      postAuthorId: schema.communityPosts.userId,
      ownerId: schema.groups.ownerId,
    })
    .from(schema.crewPinnedPosts)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPosts.id, schema.crewPinnedPosts.postId),
    )
    .innerJoin(schema.groups, eq(schema.groups.id, schema.crewPinnedPosts.groupId))
    .where(eq(schema.crewPinnedPosts.pinnedBy, userId));

  for (const pin of pins) {
    if (pin.postAuthorId === userId) continue;
    if (pin.ownerId !== userId) {
      await transaction
        .update(schema.crewPinnedPosts)
        .set({ pinnedBy: pin.ownerId })
        .where(eq(schema.crewPinnedPosts.groupId, pin.groupId));
      continue;
    }
    await transaction
      .delete(schema.crewPinnedPosts)
      .where(eq(schema.crewPinnedPosts.groupId, pin.groupId));
  }
}
