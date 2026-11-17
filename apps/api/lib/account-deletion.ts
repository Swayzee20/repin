import "server-only";

import { isCrewPhotoPathForGroup } from "@repin/validation";

import { getSupabaseAdminClient } from "./supabase-admin";
import { deleteStoredWorkoutPhotos } from "./workout-photos";

const WORKOUT_PHOTOS_BUCKET = "workout-photos";
const CREW_PHOTOS_BUCKET = "crew-photos";
const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertAccountId(userId: string) {
  if (!ACCOUNT_ID_PATTERN.test(userId)) {
    throw new Error("Account id is invalid");
  }
}

async function listStorageFolder(
  bucketName: string,
  folder: string,
  allowedPrefix: string,
) {
  const bucket = getSupabaseAdminClient().client.storage.from(bucketName);
  const paths: string[] = [];

  const collect = async (current: string, depth: number) => {
    if (depth > 4) return;
    const pageSize = 100;
    let offset = 0;

    for (;;) {
      const { data, error } = await bucket.list(current, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error(`${bucketName} photos could not be listed`, { cause: error });
      }

      const items = data ?? [];
      for (const item of items) {
        if (!item.name || item.name === "." || item.name === "..") continue;
        const path = `${current}/${item.name}`;
        if (!path.startsWith(allowedPrefix) || path.includes("..")) continue;
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

  await collect(folder, 0);
  return paths;
}

export async function listUserWorkoutPhotoPaths(userId: string) {
  assertAccountId(userId);
  return listStorageFolder(WORKOUT_PHOTOS_BUCKET, userId, `${userId}/`);
}

export async function listCrewPhotoFolderPaths(groupId: string) {
  if (!ACCOUNT_ID_PATTERN.test(groupId)) {
    throw new Error("Crew id is invalid");
  }
  return listStorageFolder(CREW_PHOTOS_BUCKET, groupId, `${groupId}/`);
}

async function removeStoragePaths(bucketName: string, paths: string[], label: string) {
  const unique = [...new Set(paths.filter((path) => path && !path.includes("..")))];
  if (!unique.length) return;
  const bucket = getSupabaseAdminClient().client.storage.from(bucketName);
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const { error } = await bucket.remove(batch);
    if (error) {
      throw new Error(`${label} could not be deleted`, { cause: error });
    }
  }
}

export async function deleteUserWorkoutPhotos(userId: string, retain: Set<string> = new Set()) {
  const paths = (await listUserWorkoutPhotoPaths(userId)).filter((path) => !retain.has(path));
  await removeStoragePaths(WORKOUT_PHOTOS_BUCKET, paths, "Workout photos");
}

export async function deleteClosedCrewStorage(
  groupIds: string[],
  extraPaths: string[],
  retain: Set<string>,
) {
  const crewPaths: string[] = [];
  for (const groupId of groupIds) {
    const folderPaths = await listCrewPhotoFolderPaths(groupId);
    crewPaths.push(
      ...folderPaths.filter((path) => isCrewPhotoPathForGroup(path, groupId) && !retain.has(path)),
    );
  }
  await removeStoragePaths(CREW_PHOTOS_BUCKET, crewPaths, "Crew photos");

  const workoutPaths = extraPaths.filter((path) => !retain.has(path) && !crewPaths.includes(path));
  if (workoutPaths.length) {
    await deleteStoredWorkoutPhotos(workoutPaths);
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
