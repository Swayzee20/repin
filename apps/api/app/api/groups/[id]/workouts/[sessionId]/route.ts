import { getCommunityWorkoutDetailForMember } from "@repin/db";
import {
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../lib/supabase-auth";
import { addAuthorizedWorkoutPhotoUrls } from "../../../../../../lib/workout-photos";
import { withResolvedDisplayName } from "../../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { id, sessionId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);

    if (!groupId.success || !workoutSessionId.success) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const detail = await getCommunityWorkoutDetailForMember({
      userId: user.id,
      groupId: groupId.data,
      workoutSessionId: workoutSessionId.data,
    });

    if (!detail) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [detailWithPhotoUrl] = await addAuthorizedWorkoutPhotoUrls([detail]);
    if (!detailWithPhotoUrl) {
      throw new Error("Workout detail could not be composed");
    }

    return NextResponse.json(
      { workout: withResolvedDisplayName(detailWithPhotoUrl) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Workout detail could not be loaded", error);
    return NextResponse.json(
      { error: "Workout detail could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
