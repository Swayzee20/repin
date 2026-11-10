import {
  removeCommunityPostGoalBadges,
  restoreCommunityPostGoalBadges,
} from "@repin/db";
import {
  groupIdSchema,
  restoreGoalBadgesSchema,
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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const goalBadges = await removeCommunityPostGoalBadges({
      userId: user.id,
      groupId: identifiers.groupId,
      sessionId: identifiers.sessionId,
    });
    return NextResponse.json({ goalBadges }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal badge could not be removed");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const body: unknown = await request.json().catch(() => null);
    const input = restoreGoalBadgesSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Undo details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const goalBadges = await restoreCommunityPostGoalBadges({
      userId: user.id,
      groupId: identifiers.groupId,
      sessionId: identifiers.sessionId,
      periodIds: input.data.periodIds,
    });
    return NextResponse.json({ goalBadges }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal badge could not be restored");
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
