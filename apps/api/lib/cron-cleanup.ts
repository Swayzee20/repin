import { authorizeCronRequest } from "./cron-auth";

export async function handleCronCleanupRequest(input: {
  authorization: string | null;
  secret: string | undefined;
  cleanup: () => Promise<{ deletedCount: number; mediaPathsToDelete: string[] }>;
  deletePhotos: (paths: string[]) => Promise<void>;
}) {
  if (!authorizeCronRequest(input.secret, input.authorization)) {
    return {
      status: 401 as const,
      body: { error: "Unauthorized" },
    };
  }

  const result = await input.cleanup();
  if (result.mediaPathsToDelete.length) {
    await input.deletePhotos(result.mediaPathsToDelete);
  }
  console.info("[cron] cleanup completed", {
    deletedEvidence: result.deletedCount,
    photosRemoved: result.mediaPathsToDelete.length,
  });
  return {
    status: 200 as const,
    body: {
      ok: true,
      deletedEvidence: result.deletedCount,
      photosRemoved: result.mediaPathsToDelete.length,
    },
  };
}
