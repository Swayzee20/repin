import { z } from "zod";

export const GENERAL_POST_BODY_MAX = 2000;
export const GENERAL_POST_COUNTER_FROM = 1800;
export const GENERAL_POST_PHOTO_MAX = 6;
export const GENERAL_POST_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const GENERAL_POST_CREW_MAX = 10;

export const generalPostPhotoContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type GeneralPostPhotoContentType =
  (typeof generalPostPhotoContentTypes)[number];

const urlInText = /https?:\/\/[^\s<>"'`]+|(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\/[^\s<>"'`]*/gi;

export function extractPublicationUrls(body: string | null | undefined) {
  if (!body) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of body.matchAll(urlInText)) {
    const raw = match[0]?.replace(/[),.;!?]+$/u, "") ?? "";
    if (!raw || seen.has(raw)) continue;
    if (raw.length > 2048) continue;
    seen.add(raw);
    urls.push(raw);
  }
  return urls;
}

export function generalPostHasContent(input: {
  body?: string | null;
  photoCount: number;
}) {
  return Boolean(input.body?.trim()) || input.photoCount > 0;
}

export function generalPostDisabledReason(input: {
  body?: string | null;
  photoCount: number;
  uploading: boolean;
  failedUpload: boolean;
}) {
  const length = input.body?.length ?? 0;
  if (length > GENERAL_POST_BODY_MAX) {
    return generalPostCopy.shorten;
  }
  if (input.uploading || input.failedUpload) {
    return generalPostCopy.waitForUploads;
  }
  if (!generalPostHasContent({ body: input.body, photoCount: input.photoCount })) {
    return generalPostCopy.emptyHelper;
  }
  return null;
}

export function shouldShowCharacterCounter(length: number) {
  return length >= GENERAL_POST_COUNTER_FROM || length > GENERAL_POST_BODY_MAX;
}

export function formatCharacterCounter(length: number) {
  return `${length.toLocaleString("en-US")} / ${GENERAL_POST_BODY_MAX.toLocaleString("en-US")}`;
}

export function formatPostToCrews(names: string[]) {
  if (names.length === 0) return generalPostCopy.chooseCrews;
  if (names.length === 1) return `Post to ${names[0]}`;
  if (names.length === 2) return `Post to ${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  return `Post to ${names.slice(0, -1).join(", ")}, and ${last}`;
}

export function formatPostedTo(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")}, and ${last}`;
}

export function formatEmptyBoard(crewName: string) {
  return `No posts yet. Be the first to share with ${crewName}.`;
}

export function formatDeletePostBody(names: string[]) {
  const crews = formatPostedTo(names) || "all crews";
  return `This removes the post from ${crews}. Comments and reactions in those crews are deleted too. This cannot be undone.`;
}

export function formatPinBody(crewName: string) {
  return `It stays at the top of ${crewName}'s board. You can pin one post at a time in this crew.`;
}

export function formatReplacePinBody(crewName: string) {
  return `This takes the place of the post that's pinned now on ${crewName}'s board.`;
}

export const generalPostCopy = {
  newPost: "New post",
  editPost: "Edit post",
  post: "Post",
  save: "Save",
  emptyHelper: "Write something or add a photo to post.",
  shorten: "Shorten your post to 2,000 characters.",
  waitForUploads: "Wait for every photo to finish uploading.",
  chooseCrews: "Choose crews",
  postedTo: "Posted to",
  crewsLocked: "Crews can't be changed after you post.",
  pickerIntro: "Pick 1 to 10 crews. Crews can't be changed after you post.",
  pickerLimit: "You can post to 10 crews at a time.",
  pickerEmpty: "You're not in a crew yet. Join or create a crew to post.",
  pickerLoading: "Loading crews…",
  pickerLoadErrorTitle: "Couldn't load your crews.",
  loadErrorTitle: "Couldn't load the board",
  tryAgain: "Try again",
  offline: "You're offline. Showing what we have.",
  postFailed: "Couldn't post. Try again.",
  deleteTitle: "Delete post from all crews?",
  deleteAction: "Delete post",
  cancel: "Cancel",
  pinTitle: "Pin this post?",
  pinAction: "Pin post",
  replacePinTitle: "Replace current pin?",
  replacePinAction: "Replace pin",
  unpinToast: "Post unpinned.",
  pinEyebrow: "Pinned",
  typePill: "Post",
  detailTitle: "Post",
  addComment: "Add a comment...",
  newPostsToggle: "New posts from your crew",
  plusChooserTitle: "Log a workout",
  composerPlaceholder: "Write something...",
  addPhoto: "Add",
  retry: "Retry",
} as const;

export function generalPostPhotoPathPattern(authorId: string, publicationId: string) {
  return new RegExp(
    `^${authorId.replaceAll("-", "\\-")}/posts/${publicationId.replaceAll("-", "\\-")}/[0-9a-f-]+\\.[a-z0-9]+$`,
    "i",
  );
}

export function isGeneralPostPhotoPath(
  path: string,
  authorId: string,
  publicationId: string,
) {
  return (
    !path.includes("..")
    && generalPostPhotoPathPattern(authorId, publicationId).test(path)
  );
}

export const reserveGeneralPostPhotoSchema = z
  .object({
    publicationId: z.uuid().optional(),
    contentType: z.enum(generalPostPhotoContentTypes),
    byteSize: z.number().int().positive().max(GENERAL_POST_PHOTO_MAX_BYTES),
  })
  .strict();

export const completeGeneralPostPhotoSchema = z
  .object({
    reservationId: z.uuid(),
  })
  .strict();

export const createGeneralPostSchema = z
  .object({
    publicationId: z.uuid(),
    body: z.string().max(GENERAL_POST_BODY_MAX).optional().nullable(),
    groupIds: z.array(z.uuid()).min(1).max(GENERAL_POST_CREW_MAX),
    photoIds: z.array(z.uuid()).max(GENERAL_POST_PHOTO_MAX).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (!generalPostHasContent({ body: value.body, photoCount: value.photoIds.length })) {
      context.addIssue({
        code: "custom",
        message: generalPostCopy.emptyHelper,
        path: ["body"],
      });
    }
  });

export const updateGeneralPostSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    body: z.string().max(GENERAL_POST_BODY_MAX).optional().nullable(),
    photoIds: z.array(z.uuid()).max(GENERAL_POST_PHOTO_MAX).optional(),
  })
  .strict();

export const pinGeneralPostSchema = z
  .object({
    replace: z.boolean().optional(),
  })
  .strict();

export const communityFeedQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function encodeCommunityFeedCursor(input: { createdAt: Date; id: string }) {
  return `${input.createdAt.toISOString()}|${input.id}`;
}

export function decodeCommunityFeedCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;
  return { createdAt: date, id: parsed.data };
}
