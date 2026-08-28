import {
  deleteCommunityPostForOwner,
  getCommunityWorkoutDetailForMember,
  updateWorkoutForOwner,
} from "@repin/db";
import {
  createWorkoutSchema,
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireAuthenticatedUser,
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
    const user = await requireAuthenticatedUser(request, timing);
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const body: unknown = await request.json().catch(() => null);
    const input = createWorkoutSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Workout details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }
    if (input.data.photoPath && !input.data.photoPath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Workout photo path is invalid" }, { status: 400 });
    }

    const updated = await updateWorkoutForOwner({
      userId: user.id,
      groupId: identifiers.groupId,
      workoutSessionId: identifiers.sessionId,
      ...input.data,
      occurredAt: new Date(input.data.occurredAt),
    });
    if (!updated) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const detail = await getCommunityWorkoutDetailForMember({
      userId: user.id,
      groupId: identifiers.groupId,
      workoutSessionId: identifiers.sessionId,
    });
    if (!detail) throw new Error("Updated workout could not be loaded");
    const [withPhoto] = await addAuthorizedWorkoutPhotoUrls([detail]);
    if (!withPhoto) throw new Error("Updated workout could not be composed");
    return NextResponse.json(
      { workout: withResolvedDisplayName(withPhoto) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mutationError(error, "Workout could not be updated");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== "post" && scope !== "workout") {
      return NextResponse.json({ error: "Choose what to delete" }, { status: 400 });
    }

    const deleted = await deleteCommunityPostForOwner({
      userId: user.id,
      groupId: identifiers.groupId,
      workoutSessionId: identifiers.sessionId,
      deleteWorkout: scope === "workout",
    });
    if (!deleted) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    return NextResponse.json(
      { deleted: scope, photoPaths: deleted.photoPaths },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mutationError(error, "Workout could not be deleted");
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

function mutationError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 503 });
}
