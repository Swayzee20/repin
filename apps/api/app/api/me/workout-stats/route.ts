import { getOwnedWorkoutStats } from "@repin/db";
import { workoutStatsQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleDashboardRouteError } from "../../../../lib/profile-dashboard-route";
import { requireApplicationUser } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const query = workoutStatsQuerySchema.safeParse({
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      distanceUnit: url.searchParams.get("distanceUnit") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json(
        { error: "Workout stats request is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const stats = await getOwnedWorkoutStats({
      userId: user.id,
      timeZone: query.data.timeZone,
      distanceUnit: query.data.distanceUnit,
    });
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleDashboardRouteError(error, "Workout stats could not be loaded");
  }
}
