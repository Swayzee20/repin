import "server-only";

import {
  isPushRecipientEligible,
  REACTION_PUSH_WINDOW_MS,
  resolveCrewNotificationPrefs,
  type CrewAlertType,
  type PushPlatform,
} from "@repin/validation";
import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { getDatabase } from "./connection";
import { notBlockedAuthor } from "./moderation";
import {
  activeMembership,
  openGroup,
} from "./membership";
import * as schema from "./schema";
import {
  communityPostVisibleToSql,
  communityReactionVisibleToSql,
} from "./visibility";

export type CrewPushRecipient = {
  userId: string;
  groupId: string;
  groupName: string;
  sessionId: string;
  postId: string;
};

export async function upsertDevicePushToken(input: {
  userId: string;
  expoPushToken: string;
  platform: PushPlatform;
}) {
  const now = new Date();
  const [row] = await getDatabase()
    .insert(schema.devicePushTokens)
    .values({
      userId: input.userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      createdAt: now,
      lastSeenAt: now,
      disabledAt: null,
    })
    .onConflictDoUpdate({
      target: schema.devicePushTokens.expoPushToken,
      set: {
        userId: input.userId,
        platform: input.platform,
        lastSeenAt: now,
        disabledAt: null,
      },
    })
    .returning({
      id: schema.devicePushTokens.id,
      expoPushToken: schema.devicePushTokens.expoPushToken,
    });

  if (!row) throw new Error("Push token could not be saved");
  return row;
}

export async function removeDevicePushToken(input: {
  userId: string;
  expoPushToken: string;
}) {
  await getDatabase()
    .delete(schema.devicePushTokens)
    .where(
      and(
        eq(schema.devicePushTokens.userId, input.userId),
        eq(schema.devicePushTokens.expoPushToken, input.expoPushToken),
      ),
    );
}

export async function disableDevicePushTokens(tokens: string[]) {
  if (!tokens.length) return;
  await getDatabase()
    .update(schema.devicePushTokens)
    .set({ disabledAt: new Date() })
    .where(
      and(
        inArray(schema.devicePushTokens.expoPushToken, tokens),
        isNull(schema.devicePushTokens.disabledAt),
      ),
    );
}

export async function listActivePushTokensForUsers(userIds: string[]) {
  if (!userIds.length) return [];
  return getDatabase()
    .select({
      userId: schema.devicePushTokens.userId,
      expoPushToken: schema.devicePushTokens.expoPushToken,
    })
    .from(schema.devicePushTokens)
    .where(
      and(
        inArray(schema.devicePushTokens.userId, userIds),
        isNull(schema.devicePushTokens.disabledAt),
      ),
    );
}

export async function listCrewWorkoutPushRecipients(input: {
  actorUserId: string;
  groupId: string;
  sessionId: string;
  contentCreatedAt: Date;
}): Promise<CrewPushRecipient[]> {
  const [post] = await getDatabase()
    .select({
      id: schema.communityPosts.id,
      groupName: schema.groups.name,
      closedAt: schema.groups.closedAt,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.sessionId),
        communityPostVisibleToSql(input.actorUserId, schema.communityPosts.id),
      ),
    )
    .limit(1);

  if (!post) return [];

  const members = await getDatabase()
    .select({
      userId: schema.groupMembers.userId,
      leftAt: schema.groupMembers.leftAt,
      contentVisibleAfter: schema.groupMembers.contentVisibleAfter,
      closedAt: schema.groups.closedAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        activeMembership,
        openGroup,
        ne(schema.groupMembers.userId, input.actorUserId),
        lte(schema.groupMembers.contentVisibleAfter, input.contentCreatedAt),
        communityPostVisibleToSql(schema.groupMembers.userId, post.id),
      ),
    );

  return filterRecipients({
    actorUserId: input.actorUserId,
    alertType: "crew_workout",
    contentCreatedAt: input.contentCreatedAt,
    groupId: input.groupId,
    groupName: post.groupName,
    postId: post.id,
    sessionId: input.sessionId,
    members,
  });
}

export async function listPostAuthorPushRecipient(input: {
  actorUserId: string;
  groupId: string;
  sessionId: string;
  alertType: Exclude<CrewAlertType, "crew_workout">;
  contentCreatedAt: Date;
}): Promise<CrewPushRecipient | null> {
  const [post] = await getDatabase()
    .select({
      id: schema.communityPosts.id,
      authorId: schema.communityPosts.userId,
      sessionId: schema.communityPosts.workoutSessionId,
      groupId: schema.communityPosts.groupId,
      groupName: schema.groups.name,
      closedAt: schema.groups.closedAt,
      authorLeftAt: schema.groupMembers.leftAt,
      contentVisibleAfter: schema.groupMembers.contentVisibleAfter,
      postCreatedAt: schema.communityPosts.createdAt,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.communityPosts.groupId))
    .innerJoin(
      schema.groupMembers,
      and(
        eq(schema.groupMembers.groupId, schema.communityPosts.groupId),
        eq(schema.groupMembers.userId, schema.communityPosts.userId),
      ),
    )
    .where(
      and(
        eq(schema.communityPosts.groupId, input.groupId),
        eq(schema.communityPosts.workoutSessionId, input.sessionId),
        communityPostVisibleToSql(input.actorUserId, schema.communityPosts.id),
        communityPostVisibleToSql(schema.communityPosts.userId, schema.communityPosts.id),
        notBlockedAuthor(input.actorUserId, schema.communityPosts.userId),
        lte(schema.groupMembers.contentVisibleAfter, input.contentCreatedAt),
      ),
    )
    .limit(1);

  if (!post) return null;

  const [actor] = await getDatabase()
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(
      and(
        eq(schema.groupMembers.groupId, input.groupId),
        eq(schema.groupMembers.userId, input.actorUserId),
        activeMembership,
        openGroup,
        lte(schema.groupMembers.contentVisibleAfter, input.contentCreatedAt),
      ),
    )
    .limit(1);

  if (!actor) return null;

  const recipients = await filterRecipients({
    actorUserId: input.actorUserId,
    alertType: input.alertType,
    contentCreatedAt: input.contentCreatedAt,
    groupId: post.groupId,
    groupName: post.groupName,
    postId: post.id,
    sessionId: post.sessionId,
    members: [
      {
        userId: post.authorId,
        leftAt: post.authorLeftAt,
        contentVisibleAfter: post.contentVisibleAfter,
        closedAt: post.closedAt,
      },
    ],
  });

  return recipients[0] ?? null;
}

export async function claimReactionPushSlot(postId: string) {
  const [claimed] = await getDatabase()
    .update(schema.communityPosts)
    .set({ reactionPushLastSentAt: sql`now()` })
    .where(
      and(
        eq(schema.communityPosts.id, postId),
        isNull(schema.communityPosts.removedAt),
        sql`(
          ${schema.communityPosts.reactionPushLastSentAt} is null
          or ${schema.communityPosts.reactionPushLastSentAt}
            < now() - (${REACTION_PUSH_WINDOW_MS}::bigint * interval '1 millisecond')
        )`,
      ),
    )
    .returning({ id: schema.communityPosts.id });

  return Boolean(claimed);
}

export async function countVisibleReactors(input: {
  postId: string;
  authorId: string;
}) {
  const [row] = await getDatabase()
    .select({
      value: sql<number>`count(distinct ${schema.communityPostReactions.userId})::int`,
    })
    .from(schema.communityPostReactions)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPosts.id, schema.communityPostReactions.communityPostId),
    )
    .where(
      and(
        eq(schema.communityPostReactions.communityPostId, input.postId),
        ne(schema.communityPostReactions.userId, input.authorId),
        communityReactionVisibleToSql(input.authorId, schema.communityPostReactions.id),
      ),
    );

  return row?.value ?? 0;
}

async function filterRecipients(input: {
  actorUserId: string;
  alertType: CrewAlertType;
  contentCreatedAt: Date;
  groupId: string;
  groupName: string;
  postId: string;
  sessionId: string;
  members: Array<{
    userId: string;
    leftAt: Date | null;
    contentVisibleAfter: Date;
    closedAt: Date | null;
  }>;
}): Promise<CrewPushRecipient[]> {
  if (!input.members.length) return [];

  const prefRows = await getDatabase()
    .select({
      userId: schema.crewNotificationPrefs.userId,
      alertType: schema.crewNotificationPrefs.alertType,
      enabled: schema.crewNotificationPrefs.enabled,
    })
    .from(schema.crewNotificationPrefs)
    .where(
      and(
        eq(schema.crewNotificationPrefs.groupId, input.groupId),
        inArray(
          schema.crewNotificationPrefs.userId,
          input.members.map((member) => member.userId),
        ),
      ),
    );

  const prefsByUser = new Map<string, Array<{ alertType: string; enabled: boolean }>>();
  for (const row of prefRows) {
    const list = prefsByUser.get(row.userId) ?? [];
    list.push({ alertType: row.alertType, enabled: row.enabled });
    prefsByUser.set(row.userId, list);
  }

  return input.members.flatMap((member) => {
    const prefs = resolveCrewNotificationPrefs(prefsByUser.get(member.userId) ?? []);
    const eligible = isPushRecipientEligible({
      actorUserId: input.actorUserId,
      recipientUserId: member.userId,
      recipientLeftAt: member.leftAt,
      crewClosedAt: member.closedAt,
      contentCreatedAt: input.contentCreatedAt,
      recipientContentVisibleAfter: member.contentVisibleAfter,
      prefs,
      alertType: input.alertType,
    });
    if (!eligible) return [];
    return [{
      userId: member.userId,
      groupId: input.groupId,
      groupName: input.groupName,
      sessionId: input.sessionId,
      postId: input.postId,
    }];
  });
}
