import { z } from "zod";

import {
  crewAlertAllowed,
  type CrewAlertType,
  type CrewNotificationPrefs,
} from "./crew";
import {
  commentPushBody,
  newPostPushTitle,
  newWorkoutPushBody,
  reactionPushBody,
} from "./push-copy";

export {
  commentPushBody,
  firstPostLine,
  newPostPushTitle,
  newWorkoutPushBody,
  pushCopy,
  reactionPushBody,
} from "./push-copy";

export const REACTION_PUSH_WINDOW_MS = 5 * 60 * 1_000;

export const crewPushAlertTypes = [
  "crew_workout",
  "crew_comment",
  "crew_reaction",
  "crew_post",
] as const;

export type CrewPushAlertType = (typeof crewPushAlertTypes)[number];

export const expoPushTokenPattern = /^Expo(nent)?PushToken\[.+\]$/;

export const pushPlatforms = ["ios", "android", "web"] as const;
export type PushPlatform = (typeof pushPlatforms)[number];

export const registerPushTokenSchema = z
  .object({
    expoPushToken: z.string().regex(expoPushTokenPattern, "Invalid Expo push token"),
    platform: z.enum(pushPlatforms),
    supportsPostTargets: z.boolean().optional(),
  })
  .strict();

export const unregisterPushTokenSchema = z
  .object({
    expoPushToken: z.string().regex(expoPushTokenPattern, "Invalid Expo push token"),
  })
  .strict();

export type CrewPushPayload = {
  type: CrewPushAlertType;
  groupId: string;
  sessionId?: string;
  postId: string;
};

const uuidString = z.uuid();

export function parseCrewPushPayload(data: unknown): CrewPushPayload | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const type = record.type;
  if (
    type !== "crew_workout"
    && type !== "crew_comment"
    && type !== "crew_reaction"
    && type !== "crew_post"
  ) {
    return null;
  }
  const groupId = readUuid(record.groupId);
  const postId = readUuid(record.postId);
  if (!groupId || !postId) return null;
  if (type === "crew_post") {
    return { type, groupId, postId };
  }
  const sessionId = readUuid(record.sessionId);
  if (!sessionId) return null;
  return { type, groupId, sessionId, postId };
}

function readUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = uuidString.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function crewPushHref(payload: CrewPushPayload, postGone = false) {
  if (postGone) return `/groups/${payload.groupId}`;
  const params = new URLSearchParams({
    groupId: payload.groupId,
    fromPush: "1",
  });
  if (payload.type === "crew_post") {
    params.set("post", payload.postId);
    return `/(tabs)/community?${params.toString()}`;
  }
  return `/workouts/${payload.sessionId}?${params.toString()}`;
}

export function shouldSendReactionPush(lastSentAt: Date | null, now: Date) {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= REACTION_PUSH_WINDOW_MS;
}

export function isPushRecipientEligible(input: {
  actorUserId: string;
  recipientUserId: string;
  recipientLeftAt: Date | null;
  crewClosedAt: Date | null;
  contentCreatedAt: Date;
  recipientContentVisibleAfter: Date;
  prefs: CrewNotificationPrefs;
  alertType: CrewAlertType;
}) {
  if (input.actorUserId === input.recipientUserId) return false;
  if (input.recipientLeftAt != null) return false;
  if (input.crewClosedAt != null) return false;
  if (input.contentCreatedAt < input.recipientContentVisibleAfter) return false;
  return crewAlertAllowed(input.prefs, input.alertType);
}

export function crewPushTitle(input: {
  type: CrewPushAlertType;
  actorName: string;
  crewName: string;
}) {
  if (input.type === "crew_post") {
    return newPostPushTitle(input.actorName, input.crewName);
  }
  return undefined;
}

export function crewPushBody(input: {
  type: CrewPushAlertType;
  actorName: string;
  crewName: string;
  reactionCount?: number;
  firstLine?: string;
}) {
  if (input.type === "crew_post") {
    return input.firstLine?.trim() || newPostPushTitle(input.actorName, input.crewName);
  }
  if (input.type === "crew_workout") {
    return newWorkoutPushBody(input.actorName, input.crewName);
  }
  if (input.type === "crew_comment") {
    return commentPushBody(input.actorName);
  }
  return reactionPushBody(input.actorName, input.reactionCount ?? 1);
}
