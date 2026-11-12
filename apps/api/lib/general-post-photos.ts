import "server-only";

import type { GeneralPostDetail, GeneralPostFeedItem } from "@repin/types";

import { withResolvedDisplayName } from "./user-display";
import { signWorkoutPhotoPaths } from "./workout-photos";

export async function withSignedGeneralPostPhotos<T extends GeneralPostFeedItem>(
  items: T[],
): Promise<T[]> {
  const paths = items.flatMap((item) => item.photos.map((photo) => photo.path));
  const urls = await signWorkoutPhotoPaths(paths);
  return items.map((item) => ({
    ...item,
    photos: item.photos.map((photo) => ({
      ...photo,
      url: urls.get(photo.path) ?? null,
    })),
  }));
}

export async function withSignedGeneralPost<T extends GeneralPostFeedItem | GeneralPostDetail>(
  item: T,
): Promise<T> {
  const [signed] = await withSignedGeneralPostPhotos([item]);
  return signed ?? item;
}

export function enrichGeneralPost<T extends GeneralPostFeedItem>(item: T) {
  return withResolvedDisplayName(item);
}
