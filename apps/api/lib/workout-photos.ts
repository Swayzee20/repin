import "server-only";

import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

type WorkoutWithPhotoPath = { id: string; photoPath: string | null };

function getStorageAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const storageAdminKey = secretKey || serviceRoleKey;
  const keySource = secretKey ? "secret" : serviceRoleKey ? "service_role" : null;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !storageAdminKey) {
    throw new Error(
      "Supabase workout photo signing requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (
    storageAdminKey === publishableKey ||
    storageAdminKey.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "Supabase workout photo signing is configured with a publishable key instead of a server secret",
    );
  }

  return {
    client: createClient(supabaseUrl, storageAdminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }),
    keySource,
  };
}

export async function addAuthorizedWorkoutPhotoUrls<T extends WorkoutWithPhotoPath>(
  workouts: T[],
): Promise<Array<T & { photoUrl: string | null }>> {
  if (!workouts.some((workout) => workout.photoPath)) {
    return workouts.map((workout) => ({ ...workout, photoUrl: null }));
  }

  const { client, keySource } = getStorageAdminClient();
  const storage = client.storage.from("workout-photos");

  return Promise.all(
    workouts.map(async (workout) => {
      if (!workout.photoPath) return { ...workout, photoUrl: null };

      const { data, error } = await storage.createSignedUrl(
        workout.photoPath,
        SIGNED_URL_LIFETIME_SECONDS,
      );

      if (error) {
        console.error("An authorized workout photo URL could not be generated", {
          workoutId: workout.id,
          hasPhotoPath: true,
          signerKeySource: keySource,
          signingSucceeded: false,
          hasPhotoUrl: false,
          ...getStorageErrorDetails(error),
        });
        return { ...workout, photoUrl: null };
      }

      const photoUrl = data?.signedUrl?.trim() || null;
      console.info("Authorized workout photo URL generation completed", {
        workoutId: workout.id,
        hasPhotoPath: true,
        signerKeySource: keySource,
        signingSucceeded: photoUrl !== null,
        hasPhotoUrl: photoUrl !== null,
      });

      return { ...workout, photoUrl };
    }),
  );
}

function getStorageErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { error: "Unknown Storage error", statusCode: null, errorCode: null };
  }

  const details = error as Record<string, unknown>;
  return {
    error: typeof details.message === "string" ? details.message : "Storage request failed",
    statusCode:
      typeof details.statusCode === "string" || typeof details.statusCode === "number"
        ? details.statusCode
        : null,
    errorCode: typeof details.code === "string" ? details.code : null,
  };
}
