import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";

const WORKOUT_PHOTOS_BUCKET = "workout-photos";
const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertAccountId(userId: string) {
  if (!ACCOUNT_ID_PATTERN.test(userId)) {
    throw new Error("Account id is invalid");
  }
}

export async function deleteUserWorkoutPhotos(userId: string) {
  assertAccountId(userId);
  const bucket = getSupabaseAdminClient().client.storage.from(WORKOUT_PHOTOS_BUCKET);
  const paths: string[] = [];

  const collect = async (folder: string, depth: number) => {
    if (depth > 4) return;
    const pageSize = 100;
    let offset = 0;

    for (;;) {
      const { data, error } = await bucket.list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error("Workout photos could not be listed", { cause: error });
      }

      const items = data ?? [];
      for (const item of items) {
        if (!item.name || item.name === "." || item.name === "..") continue;
        const path = `${folder}/${item.name}`;
        if (!path.startsWith(`${userId}/`) || path.includes("..")) continue;
        if (item.id == null && item.metadata == null) {
          await collect(path, depth + 1);
          continue;
        }
        paths.push(path);
      }

      if (items.length < pageSize) break;
      offset += items.length;
    }
  };

  await collect(userId, 0);

  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await bucket.remove(batch);
    if (error) {
      throw new Error("Workout photos could not be deleted", { cause: error });
    }
  }
}

export async function deleteAuthUser(userId: string) {
  assertAccountId(userId);
  const { error } = await getSupabaseAdminClient().client.auth.admin.deleteUser(userId);
  if (!error) return;

  const code = error.code?.toLowerCase() ?? "";
  const message = error.message.toLowerCase();
  // A parallel delete, or a retry after the auth user was already removed,
  // should still finish successfully.
  if (error.status === 404 || code === "user_not_found" || message.includes("not found")) {
    return;
  }

  throw new Error("Auth user could not be deleted", { cause: error });
}
