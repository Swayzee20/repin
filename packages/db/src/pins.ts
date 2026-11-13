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
