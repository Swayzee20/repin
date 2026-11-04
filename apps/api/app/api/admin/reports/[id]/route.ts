import { reviewContentReport } from "@repin/db";
import { NextResponse } from "next/server";

import { AdminAccessError, requireAdminUser } from "../../../../../lib/admin-auth";
import { handleAdminReportAction } from "../../../../../lib/admin-review";
import { reportUnexpectedRouteError } from "../../../../../lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    let userId: string | null = null;
    try {
      const user = await requireAdminUser(request);
      userId = user.id;
    } catch (error) {
      if (error instanceof AdminAccessError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw error;
    }

    const body: unknown = await request.json().catch(() => null);
    const result = await handleAdminReportAction(
      {
        userId,
        reportId: id,
        body,
        adminUserIds: process.env.ADMIN_USER_IDS,
      },
      reviewContentReport,
    );
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    reportUnexpectedRouteError("Admin report could not be reviewed", error);
    return NextResponse.json(
      { error: "Couldn't save. Check your connection and try again." },
      { status: 503 },
    );
  }
}
