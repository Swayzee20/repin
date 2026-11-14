import type { DeletionPreviewCrew } from "../ui/danger-zone-copy";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function fetchDeletionPreview(accessToken: string): Promise<DeletionPreviewCrew[]> {
  const response = await fetch(`${apiUrl}/api/account/deletion-preview`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(7_500),
  });
  const body = (await response.json().catch(() => null)) as {
    crews?: DeletionPreviewCrew[];
    error?: string;
  } | null;
  if (!response.ok || !Array.isArray(body?.crews)) {
    throw new Error(body?.error ?? "Couldn't load your crews.");
  }
  return body.crews;
}
