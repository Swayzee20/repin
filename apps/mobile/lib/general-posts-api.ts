import type { CommunityPostComment, CommunityReactionSummary, GeneralPostDetail } from "@repin/types";
import type { GeneralPostPhotoContentType } from "@repin/validation";

import { apiRequest } from "./api";

export async function createGeneralPostDraft(accessToken: string) {
  return apiRequest<{ publicationId: string }>("/api/posts/draft", accessToken, {
    method: "POST",
  });
}

export async function reserveGeneralPostPhoto(input: {
  accessToken: string;
  publicationId?: string;
  contentType: GeneralPostPhotoContentType;
  byteSize: number;
}) {
  return apiRequest<{
    reservationId: string;
    publicationId: string;
    storagePath: string;
    contentType: string;
    upload: { signedUrl: string; token: string; path: string };
  }>("/api/posts/photos", input.accessToken, {
    method: "POST",
    body: JSON.stringify({
      publicationId: input.publicationId,
      contentType: input.contentType,
      byteSize: input.byteSize,
    }),
  });
}

export async function completeGeneralPostPhoto(input: {
  accessToken: string;
  reservationId: string;
}) {
  return apiRequest<{
    reservationId: string;
    publicationId: string;
    status: string;
    uploaded: boolean;
  }>("/api/posts/photos/complete", input.accessToken, {
    method: "POST",
    body: JSON.stringify({ reservationId: input.reservationId }),
  });
}

export async function publishGeneralPost(input: {
  accessToken: string;
  publicationId: string;
  body: string | null;
  groupIds: string[];
  photoIds: string[];
}) {
  return apiRequest<{ publicationId: string; posts: Array<{ id: string; groupId: string }> }>(
    "/api/posts",
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        publicationId: input.publicationId,
        body: input.body,
        groupIds: input.groupIds,
        photoIds: input.photoIds,
      }),
    },
  );
}

export function postedCrewNames(detail: Pick<GeneralPostDetail, "destinationCrewNames">) {
  return detail.destinationCrewNames ?? [];
}

export async function fetchGeneralPostDetail(input: {
  accessToken: string;
  groupId: string;
  postId: string;
}) {
  const body = await apiRequest<{ post: GeneralPostDetail }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}`,
    input.accessToken,
  );
  return body.post;
}

export async function saveGeneralPost(input: {
  accessToken: string;
  groupId: string;
  postId: string;
  expectedRevision: number;
  body: string | null;
  photoIds?: string[];
}) {
  return apiRequest<{ post: GeneralPostDetail; revision: number }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}`,
    input.accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: input.expectedRevision,
        body: input.body,
        photoIds: input.photoIds,
      }),
    },
  );
}

export async function deleteGeneralPost(input: {
  accessToken: string;
  groupId: string;
  postId: string;
}) {
  return apiRequest<{ deleted: true }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}`,
    input.accessToken,
    { method: "DELETE" },
  );
}

export async function pinGeneralPost(input: {
  accessToken: string;
  groupId: string;
  postId: string;
  replace?: boolean;
}) {
  return apiRequest<{ pinned?: true; needsReplaceConfirm?: true }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}/pin`,
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ replace: input.replace }),
    },
  );
}

export async function unpinGeneralPost(input: {
  accessToken: string;
  groupId: string;
  postId: string;
}) {
  return apiRequest<{ unpinned: true }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}/pin`,
    input.accessToken,
    { method: "DELETE" },
  );
}

export async function setGeneralPostReaction(input: {
  accessToken: string;
  groupId: string;
  postId: string;
  reactionType: "fire" | "strong" | "clap";
}) {
  const body = await apiRequest<{ reactions: CommunityReactionSummary }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}/reaction`,
    input.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ reactionType: input.reactionType }),
    },
  );
  return body.reactions;
}

export async function removeGeneralPostReaction(input: {
  accessToken: string;
  groupId: string;
  postId: string;
}) {
  const body = await apiRequest<{ reactions: CommunityReactionSummary }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}/reaction`,
    input.accessToken,
    { method: "DELETE" },
  );
  return body.reactions;
}

export async function createGeneralPostComment(input: {
  accessToken: string;
  groupId: string;
  postId: string;
  text: string;
}) {
  const body = await apiRequest<{ comment: CommunityPostComment }>(
    `/api/groups/${encodeURIComponent(input.groupId)}/posts/${encodeURIComponent(input.postId)}/comments`,
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ text: input.text }),
    },
  );
  return body.comment;
}
