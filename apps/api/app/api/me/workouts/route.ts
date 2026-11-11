import { listOwnedWorkouts } from "@repin/db";
import { personalWorkoutListQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleDashboardRouteError } from "../../../../lib/profile-dashboard-route";
import { requireApplicationUser } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const query = personalWorkoutListQuerySchema.safeParse({
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      sport: url.searchParams.get("sport") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json(
        { error: "Workout history request is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const page = await listOwnedWorkouts({
      userId: user.id,
      timeZone: query.data.timeZone,
      cursor: query.data.cursor,
      limit: query.data.limit,
      sport: query.data.sport,
      from: query.data.from,
      to: query.data.to,
    });
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleDashboardRouteError(error, "Workouts could not be loaded");
  }
}
