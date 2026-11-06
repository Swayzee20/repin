import "server-only";

import { isCrewPhotoPathForGroup } from "@repin/validation";

import { getSupabaseAdminClient } from "./supabase-admin";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

function getStorageAdminClient() {
  try {
    return getSupabaseAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("publishable key")) {
      throw new Error(
        "Supabase crew photo signing is configured with a publishable key instead of a server secret",
      );
    }
    throw new Error(
      "Supabase crew photo signing requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
}

export async function signCrewPhotoUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  const { client } = getStorageAdminClient();
  const { data, error } = await client.storage
    .from("crew-photos")
    .createSignedUrl(photoPath, SIGNED_URL_LIFETIME_SECONDS);
  if (error) {
    console.error("An authorized crew photo URL could not be generated", {
      error: error.message,
    });
    return null;
  }
  return data?.signedUrl?.trim() || null;
}

export async function deleteStoredCrewPhoto(photoPath: string | null, groupId: string) {
  if (!photoPath || !isCrewPhotoPathForGroup(photoPath, groupId)) return;
  const { client } = getStorageAdminClient();
  const { error } = await client.storage.from("crew-photos").remove([photoPath]);
  if (error) {
    throw new Error("Crew photo could not be deleted", { cause: error });
  }
}
