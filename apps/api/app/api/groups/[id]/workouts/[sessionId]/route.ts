import { getCommunityWorkoutDetailForMember } from "@repin/db";
import {
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../lib/supabase-auth";
import {
  ServerTiming,
  timedJson,
} from "../../../../../../lib/server-timing";
import { addAuthorizedWorkoutPhotoUrls } from "../../../../../../lib/workout-photos";
import { withResolvedDisplayName } from "../../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireApplicationUser(request, timing);
    const { id, sessionId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);

    if (!groupId.success || !workoutSessionId.success) {
      return timedJson(
        timing,
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const detail = await timing.measure("db", () =>
      getCommunityWorkoutDetailForMember({
        userId: user.id,
        groupId: groupId.data,
        workoutSessionId: workoutSessionId.data,
      }));

    if (!detail) {
      return timedJson(
        timing,
        { error: "Workout not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [detailWithPhotoUrl] = await timing.measure("photo", () =>
      addAuthorizedWorkoutPhotoUrls([detail]));
    if (!detailWithPhotoUrl) {
      throw new Error("Workout detail could not be composed");
    }

    const workout = timing.measureSync("enrichment", () =>
      withResolvedDisplayName(detailWithPhotoUrl));

    return timedJson(
      timing,
      { workout },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return timedJson(
        timing,
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Workout detail could not be loaded", error);
    return timedJson(
      timing,
      { error: "Workout detail could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
