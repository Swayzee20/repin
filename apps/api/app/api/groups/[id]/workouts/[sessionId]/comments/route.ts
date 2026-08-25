import {
  createCommunityPostCommentForMember,
  listCommunityPostCommentsForMember,
} from "@repin/db";
import {
  createCommunityCommentSchema,
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";
import { withResolvedDisplayName } from "../../../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) return notFound();

    const comments = await listCommunityPostCommentsForMember({
      userId: user.id,
      ...target,
    });

    return comments
      ? NextResponse.json(
          { comments: comments.map(withResolvedDisplayName) },
          { headers: { "Cache-Control": "no-store" } },
        )
      : notFound();
  } catch (error) {
    return handleRouteError(error, "Community comments could not be loaded");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) return notFound();

    const body: unknown = await request.json().catch(() => null);
    const input = createCommunityCommentSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Comment is invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const comment = await createCommunityPostCommentForMember({
      userId: user.id,
      displayName: user.displayName,
      ...target,
      text: input.data.text,
    });

    return comment
      ? NextResponse.json(
          { comment: withResolvedDisplayName(comment) },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        )
      : notFound();
  } catch (error) {
    return handleRouteError(error, "Community comment could not be created");
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

function handleRouteError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(message, error);
  return NextResponse.json(
    { error: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
