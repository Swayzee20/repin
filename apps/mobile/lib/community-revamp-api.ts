import type {
  CommunityActivity,
  CommunityHighlights,
  CommunityProgress,
  CommunityReactionSummary,
  CommunityReactionType,
  CommunityWhoReacted,
} from "@repin/types";

import { removeGeneralPostReaction, setGeneralPostReaction } from "./general-posts-api";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

function weekParams() {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
  };
}

async function getJson<T>(path: string, accessToken: string, search?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...weekParams(), ...search })) {
    if (value) params.set(key, value);
  }
  const response = await fetch(`${apiUrl}${path}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(7_500),
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(body.error ?? "Request failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

export function fetchCrewProgress(input: {
  accessToken: string;
  groupId: string;
  week?: "current" | "previous";
}) {
  return getJson<{ progress: CommunityProgress }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/progress`,
    input.accessToken,
    { week: input.week },
  );
}

export function fetchCrewHighlights(input: {
  accessToken: string;
  groupId: string;
  week?: "current" | "previous";
}) {
  return getJson<{ week: "current" | "previous"; memberCount: number; highlights: CommunityHighlights }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/highlights`,
    input.accessToken,
    { week: input.week },
  );
}

export function fetchCrewActivity(input: {
  accessToken: string;
  groupId: string;
}) {
  return getJson<{ activity: CommunityActivity }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/activity`,
    input.accessToken,
  );
}

export async function toggleFeedReaction(input: {
  accessToken: string;
  groupId: string;
  postId?: string;
  sessionId?: string;
  reactionType: CommunityReactionType;
  removing: boolean;
}): Promise<CommunityReactionSummary> {
  if (input.sessionId) {
    const response = await fetch(
      `${apiUrl}/api/groups/${encodeURIComponent(input.groupId)}/workouts/${encodeURIComponent(input.sessionId)}/reaction`,
      {
        method: input.removing ? "DELETE" : "PUT",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          ...(!input.removing ? { "Content-Type": "application/json" } : {}),
        },
        ...(!input.removing ? { body: JSON.stringify({ reactionType: input.reactionType }) } : {}),
        signal: AbortSignal.timeout(7_500),
      },
    );
    const body = (await response.json()) as { error?: string; reactions?: CommunityReactionSummary };
    if (!response.ok || !body.reactions) {
      throw new Error(body.error ?? "Reaction could not be updated.");
    }
    return body.reactions;
  }
  if (!input.postId) throw new Error("Reaction could not be updated.");
  if (input.removing) {
    return removeGeneralPostReaction({
      accessToken: input.accessToken,
      groupId: input.groupId,
      postId: input.postId,
    });
  }
  return setGeneralPostReaction({
    accessToken: input.accessToken,
    groupId: input.groupId,
    postId: input.postId,
    reactionType: input.reactionType,
  });
}

export function fetchWhoReacted(input: {
  accessToken: string;
  groupId: string;
  postId?: string;
  sessionId?: string;
}) {
  const path = input.sessionId
    ? `/api/groups/${encodeURIComponent(input.groupId)}/workouts/${encodeURIComponent(input.sessionId)}/reactions`
    : `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId ?? "")}/reactions`;
  return getJson<{ reactions: CommunityWhoReacted }>(path, input.accessToken);
}
