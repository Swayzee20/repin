import { listOwnedPersonalRecords } from "@repin/db";
import { personalRecordsQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleDashboardRouteError } from "../../../../lib/profile-dashboard-route";
import { requireApplicationUser } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const query = personalRecordsQuerySchema.safeParse({
      kind: url.searchParams.get("kind") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json(
        { error: "Current bests request is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const bests = await listOwnedPersonalRecords({
      userId: user.id,
      kind: query.data.kind,
    });
    return NextResponse.json(bests, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleDashboardRouteError(error, "Current bests could not be loaded");
  }
}
