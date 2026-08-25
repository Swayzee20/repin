import {
  removeCommunityPostReactionForMember,
  setCommunityPostReactionForMember,
} from "@repin/db";
import {
  groupIdSchema,
  setCommunityReactionSchema,
  workoutSessionIdSchema,
} from "@repin/validation";

import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../../../../../lib/supabase-auth";
import {
  ServerTiming,
  timedJson,
} from "../../../../../../../lib/server-timing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireAuthenticatedUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const body: unknown = await request.json().catch(() => null);
    const input = setCommunityReactionSchema.safeParse(body);
    if (!input.success) {
      return timedJson(
        timing,
        { error: "Reaction is invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const reactions = await timing.measure("db", () =>
      setCommunityPostReactionForMember({
        userId: user.id,
        ...target,
        reactionType: input.data.reactionType,
      }));

    return reactions
      ? timedJson(timing, { reactions }, { headers: { "Cache-Control": "no-store" } })
      : notFound(timing);
  } catch (error) {
    return handleRouteError(timing, error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireAuthenticatedUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const reactions = await timing.measure("db", () =>
      removeCommunityPostReactionForMember({
        userId: user.id,
        ...target,
      }));

    return reactions
      ? timedJson(timing, { reactions }, { headers: { "Cache-Control": "no-store" } })
      : notFound(timing);
  } catch (error) {
    return handleRouteError(timing, error);
  }
}

async function readTarget(context: RouteContext) {
  const { id, sessionId } = await context.params;
  const groupId = groupIdSchema.safeParse(id);
  const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);

  return groupId.success && workoutSessionId.success
    ? { groupId: groupId.data, workoutSessionId: workoutSessionId.data }
    : null;
}

function notFound(timing: ServerTiming) {
  return timedJson(
    timing,
    { error: "Workout not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function handleRouteError(timing: ServerTiming, error: unknown) {
  if (error instanceof AuthenticationError) {
    return timedJson(
      timing,
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("Workout reaction could not be updated", error);
  return timedJson(
    timing,
    { error: "Workout reaction could not be updated" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
