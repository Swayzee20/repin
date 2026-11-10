import { shareSessionGoalBadges } from "@repin/db";
import {
  groupIdSchema,
  shareSessionGoalsSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { handleGoalRouteError } from "../../../../../../../../lib/goals-route";
import { requireApplicationUser } from "../../../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const body: unknown = await request.json().catch(() => ({}));
    const input = shareSessionGoalsSchema.safeParse(body ?? {});
    if (!input.success) {
      return NextResponse.json(
        { error: "Share details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const goalBadges = await shareSessionGoalBadges({
      userId: user.id,
      groupId: identifiers.groupId,
      sessionId: identifiers.sessionId,
      periodIds: input.data.periodIds,
    });
    return NextResponse.json({ goalBadges }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal badge could not be shared");
  }
}

async function readIdentifiers(context: RouteContext) {
  const { id, sessionId } = await context.params;
  const groupId = groupIdSchema.safeParse(id);
  const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);
  return groupId.success && workoutSessionId.success
    ? { groupId: groupId.data, sessionId: workoutSessionId.data }
    : null;
}
