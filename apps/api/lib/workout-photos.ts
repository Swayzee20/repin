import "server-only";

import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

type WorkoutWithPhotoPath = { id: string; photoPath: string | null };

function getStorageAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const storageAdminKey = secretKey || serviceRoleKey;
  const keySource: "secret" | "service_role" | null = secretKey
    ? "secret"
    : serviceRoleKey
      ? "service_role"
      : null;
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
  const photoPaths = [
    ...new Set(
      workouts.flatMap((workout) =>
        workout.photoPath ? [workout.photoPath] : []),
    ),
  ];

  if (photoPaths.length === 0) {
    return workouts.map((workout) => ({ ...workout, photoUrl: null }));
  }

  const { client, keySource } = getStorageAdminClient();
  const storage = client.storage.from("workout-photos");

  if (photoPaths.length === 1) {
    const photoPath = photoPaths[0]!;
    const { data, error } = await storage.createSignedUrl(
      photoPath,
      SIGNED_URL_LIFETIME_SECONDS,
    );
    const photoUrl = error ? null : data?.signedUrl?.trim() || null;

    return workouts.map((workout) => {
      if (workout.photoPath !== photoPath) {
        return { ...workout, photoUrl: null };
      }

      logSigningResult({
        workoutId: workout.id,
        keySource,
        photoUrl,
        error,
      });
      return { ...workout, photoUrl };
    });
  }

  const { data, error } = await storage.createSignedUrls(
    photoPaths,
    SIGNED_URL_LIFETIME_SECONDS,
  );
  const requestedPaths = new Set(photoPaths);
  const resultsByPath = new Map(
    (data ?? []).flatMap((result) => {
      const path = result.path?.trim();
      if (!path || !requestedPaths.has(path)) return [];

      return [[
        path,
        {
          photoUrl: result.error ? null : result.signedUrl?.trim() || null,
          error: result.error ? "Batch photo signing failed for this item" : null,
        },
      ] as const];
    }),
  );

  return workouts.map((workout) => {
    if (!workout.photoPath) return { ...workout, photoUrl: null };

    const result = resultsByPath.get(workout.photoPath);
    const photoUrl = result?.photoUrl ?? null;
    logSigningResult({
      workoutId: workout.id,
      keySource,
      photoUrl,
      error: error ?? result?.error ?? (result ? null : "Missing batch result"),
    });
    return { ...workout, photoUrl };
  });
}

function logSigningResult(input: {
  workoutId: string;
  keySource: "secret" | "service_role" | null;
  photoUrl: string | null;
  error: unknown;
}) {
  const details = {
    workoutId: input.workoutId,
    hasPhotoPath: true,
    signerKeySource: input.keySource,
    signingSucceeded: input.photoUrl !== null,
    hasPhotoUrl: input.photoUrl !== null,
  };

  if (input.error || !input.photoUrl) {
    console.error("An authorized workout photo URL could not be generated", {
      ...details,
      ...getStorageErrorDetails(input.error),
    });
    return;
  }

  console.info("Authorized workout photo URL generation completed", details);
}

function getStorageErrorDetails(error: unknown) {
  if (typeof error === "string") {
    return { error, statusCode: null, errorCode: null };
  }

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
