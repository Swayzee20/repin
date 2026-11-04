import { listAdminReportQueue } from "@repin/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAdminPageSession, isAdminUserId } from "../../../lib/admin-auth";
import { serializeAdminQueueItem, type SerializedAdminQueueItem } from "../../../lib/admin-queue";
import { addAuthorizedWorkoutPhotoUrls } from "../../../lib/workout-photos";

import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Reports · Moderation · repin",
  description: "Review reported posts and comments.",
};

export default async function AdminReportsPage() {
  let session: { id: string; email: string } | null = null;
  try {
    session = await getAdminPageSession();
  } catch {
    session = null;
  }

  if (session && !isAdminUserId(session.id)) {
    notFound();
  }

  const queue = session ? await loadAdminQueue() : [];

  return <ReportsView email={session?.email ?? null} initialQueue={queue} />;
}

async function loadAdminQueue(): Promise<SerializedAdminQueueItem[]> {
  const items = await listAdminReportQueue();
  let photoUrls = new Map<string, string | null>();
  try {
    const signed = await addAuthorizedWorkoutPhotoUrls(
      items.map((item) => ({ id: item.id, photoPath: item.photoPath })),
    );
    photoUrls = new Map(signed.map((item) => [item.id, item.photoUrl]));
  } catch (error) {
    console.error("Admin report photos could not be signed", error);
  }
  return items.map((item) => serializeAdminQueueItem(item, photoUrls.get(item.id) ?? null));
}
