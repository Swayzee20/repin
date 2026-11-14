import { cleanupExpiredReportEvidence } from "@repin/db";
import { NextResponse } from "next/server";

import { handleCronCleanupRequest } from "../../../../lib/cron-cleanup";
import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import { deleteStoredWorkoutPhotos } from "../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const result = await handleCronCleanupRequest({
      authorization: request.headers.get("authorization"),
      secret: process.env.CRON_SECRET,
      cleanup: cleanupExpiredReportEvidence,
      deletePhotos: deleteStoredWorkoutPhotos,
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    reportUnexpectedRouteError("Cleanup could not be completed", error);
    return NextResponse.json(
      { error: "Cleanup could not be completed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
