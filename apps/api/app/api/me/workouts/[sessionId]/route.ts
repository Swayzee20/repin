import { getOwnedWorkoutDetail } from "@repin/db";
import { workoutSessionIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleDashboardRouteError } from "../../../../../lib/profile-dashboard-route";
import { requireApplicationUser } from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { sessionId } = await context.params;
    const parsed = workoutSessionIdSchema.safeParse(sessionId);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const workout = await getOwnedWorkoutDetail({
      userId: user.id,
      sessionId: parsed.data,
    });
    if (!workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ workout }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleDashboardRouteError(error, "Workout could not be loaded");
  }
}
