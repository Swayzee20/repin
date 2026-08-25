import {
  removeCommunityPostReactionForMember,
  setCommunityPostReactionForMember,
} from "@repin/db";
import {
  groupIdSchema,
  setCommunityReactionSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) return notFound();

    const body: unknown = await request.json().catch(() => null);
    const input = setCommunityReactionSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Reaction is invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const reactions = await setCommunityPostReactionForMember({
      userId: user.id,
      ...target,
      reactionType: input.data.reactionType,
    });

    return reactions
      ? NextResponse.json({ reactions }, { headers: { "Cache-Control": "no-store" } })
      : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) return notFound();

    const reactions = await removeCommunityPostReactionForMember({
      userId: user.id,
      ...target,
    });

    return reactions
      ? NextResponse.json({ reactions }, { headers: { "Cache-Control": "no-store" } })
      : notFound();
  } catch (error) {
    return handleRouteError(error);
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

function notFound() {
  return NextResponse.json(
    { error: "Workout not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function handleRouteError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("Workout reaction could not be updated", error);
  return NextResponse.json(
    { error: "Workout reaction could not be updated" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
