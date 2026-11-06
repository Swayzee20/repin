import "server-only";

import { after } from "next/server";

import {
  claimReactionPushSlot,
  countVisibleReactors,
  listActivePushTokensForUsers,
  listCrewWorkoutPushRecipients,
  listPostAuthorPushRecipient,
  type CrewPushRecipient,
} from "@repin/db";
import { crewPushBody, type CrewPushAlertType } from "@repin/validation";

import { sendExpoPushMessages, type ExpoPushMessage } from "./expo-push";

export function scheduleCrewPush(task: () => Promise<void>) {
  const run = () =>
    task().catch((error: unknown) => {
      console.error("[push] send failed", error);
    });

  try {
    after(run);
  } catch {
    void run();
  }
}

export async function notifyCrewWorkoutPosted(input: {
  actorUserId: string;
  actorDisplayName: string;
  groupId: string;
  sessionId: string;
  createdAt: Date;
}) {
  const recipients = await listCrewWorkoutPushRecipients({
    actorUserId: input.actorUserId,
    groupId: input.groupId,
    sessionId: input.sessionId,
    contentCreatedAt: input.createdAt,
  });
  await deliverPush({
    actorDisplayName: input.actorDisplayName,
    recipients,
    type: "crew_workout",
  });
}

export async function notifyCrewComment(input: {
  actorUserId: string;
  actorDisplayName: string;
  groupId: string;
  sessionId: string;
  createdAt: Date;
}) {
  const recipient = await listPostAuthorPushRecipient({
    actorUserId: input.actorUserId,
    groupId: input.groupId,
    sessionId: input.sessionId,
    alertType: "crew_comment",
    contentCreatedAt: input.createdAt,
  });
  if (!recipient) return;
  await deliverPush({
    actorDisplayName: input.actorDisplayName,
    recipients: [recipient],
    type: "crew_comment",
  });
}

export async function notifyCrewReaction(input: {
  actorUserId: string;
  actorDisplayName: string;
  groupId: string;
  sessionId: string;
  createdAt: Date;
}) {
  const recipient = await listPostAuthorPushRecipient({
    actorUserId: input.actorUserId,
    groupId: input.groupId,
    sessionId: input.sessionId,
    alertType: "crew_reaction",
    contentCreatedAt: input.createdAt,
  });
  if (!recipient) return;

  const claimed = await claimReactionPushSlot(recipient.postId);
  if (!claimed) return;

  const reactionCount = await countVisibleReactors({
    postId: recipient.postId,
    authorId: recipient.userId,
  });
  if (reactionCount < 1) return;

  await deliverPush({
    actorDisplayName: input.actorDisplayName,
    reactionCount,
    recipients: [recipient],
    type: "crew_reaction",
  });
}

async function deliverPush(input: {
  actorDisplayName: string;
  reactionCount?: number;
  recipients: CrewPushRecipient[];
  type: CrewPushAlertType;
}) {
  if (!input.recipients.length) return;

  const tokens = await listActivePushTokensForUsers(
    input.recipients.map((recipient) => recipient.userId),
  );
  if (!tokens.length) return;

  const recipientByUser = new Map(
    input.recipients.map((recipient) => [recipient.userId, recipient]),
  );
  const messages: ExpoPushMessage[] = [];

  for (const token of tokens) {
    const recipient = recipientByUser.get(token.userId);
    if (!recipient) continue;
    messages.push({
      to: token.expoPushToken,
      body: crewPushBody({
        type: input.type,
        actorName: input.actorDisplayName,
        crewName: recipient.groupName,
        reactionCount: input.reactionCount,
      }),
      sound: "default",
      channelId: "default",
      data: {
        type: input.type,
        groupId: recipient.groupId,
        sessionId: recipient.sessionId,
        postId: recipient.postId,
      },
    });
  }

  await sendExpoPushMessages(messages);
}
