import { removeCommunityPostForGroupOwner } from "@repin/db";
import { groupIdSchema, workoutSessionIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";
import { deleteStoredWorkoutPhotos } from "../../../../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { id, sessionId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);
    if (!groupId.success || !workoutSessionId.success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const removed = await removeCommunityPostForGroupOwner({
      userId: user.id,
      groupId: groupId.data,
      workoutSessionId: workoutSessionId.data,
    });
    if (!removed) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    if (removed.photoPaths.length) {
      try {
        await deleteStoredWorkoutPhotos(removed.photoPaths);
      } catch (error) {
        console.error("Removed post photo could not be deleted from storage", error);
      }
    }

    return NextResponse.json(
      { removed: "post" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Post could not be removed", error);
    return NextResponse.json({ error: "Post could not be removed" }, { status: 503 });
  }
}
