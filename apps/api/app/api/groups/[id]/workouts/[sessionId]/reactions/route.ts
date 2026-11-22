import { listVisibleReactionsForPost } from "@repin/db";
import { groupIdSchema, workoutSessionIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleCrewMutationError } from "../../../../../../../lib/crew-route";
import { reportUnexpectedRouteError } from "../../../../../../../lib/sentry";
import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../../../../../lib/supabase-auth";
import { withResolvedDisplayName } from "../../../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, sessionId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);
    if (!groupId.success || !workoutSessionId.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const reactions = await listVisibleReactionsForPost({
      groupId: groupId.data,
      viewerUserId: user.id,
      workoutSessionId: workoutSessionId.data,
    });
    if (!reactions) {
      return NextResponse.json({ error: "Workout not found" }, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({
      reactions: {
        groups: reactions.groups.map((group) => ({
          ...group,
          reactors: group.reactors.map((reactor) => ({
            ...reactor,
            displayName: withResolvedDisplayName(reactor).displayName,
          })),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    reportUnexpectedRouteError("Reactions could not be loaded", error);
    return handleCrewMutationError(error, "Reactions could not be loaded");
  }
}
