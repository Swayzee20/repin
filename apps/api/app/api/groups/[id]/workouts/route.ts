import {
  createWorkoutForMember,
  listRecentWorkoutsForMember,
  WorkoutRequestError,
} from "@repin/db";
import { workoutTypeLabels } from "@repin/types";
import { createWorkoutSchema, groupIdSchema, workoutWriteFields } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  notifyCrewWorkoutPosted,
  scheduleCrewPush,
} from "../../../../../lib/crew-push";
import { reportUnexpectedRouteError } from "../../../../../lib/sentry";
import {
  AuthenticationError,
  requireAuthenticatedUser,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";
import { ServerTiming, timedJson } from "../../../../../lib/server-timing";
import { addAuthorizedWorkoutPhotoUrls } from "../../../../../lib/workout-photos";
import { withResolvedDisplayName } from "../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireAuthenticatedUser(request, timing);
    const groupId = await readGroupId(context);

    if (!groupId) {
      return timedJson(timing, { error: "Invalid crew ID" }, { status: 400 });
    }

    const workouts = await timing.measure("db", () =>
      listRecentWorkoutsForMember({
        userId: user.id,
        groupId,
      }));

    if (!workouts) {
      return timedJson(timing, { error: "Crew not found" }, { status: 404 });
    }

    const workoutsWithPhotoUrls = await timing.measure("photo", () =>
      addAuthorizedWorkoutPhotoUrls(workouts));
    const enrichedWorkouts = timing.measureSync("enrichment", () =>
      workoutsWithPhotoUrls.map(withResolvedDisplayName));

    return timedJson(
      timing,
      { workouts: enrichedWorkouts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Workouts could not be loaded", timing);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const groupId = await readGroupId(context);

    if (!groupId) {
      return NextResponse.json({ error: "Invalid crew ID" }, { status: 400 });
    }

    const body: unknown = await request.json().catch(() => null);
    const input = createWorkoutSchema.safeParse(body);

    if (!input.success) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Workout validation failed", {
          issues: input.error.issues,
          payloadShape: describePayloadShape(body),
        });
      }
      return NextResponse.json(
        { error: "Workout details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    if (input.data.photoPath && !input.data.photoPath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Workout photo path is invalid" },
        { status: 400 },
      );
    }

    const created = await createWorkoutForMember({
      userId: user.id,
      displayName: user.displayName,
      groupId,
      ...workoutWriteFields(input.data),
      title: input.data.name ?? workoutTypeLabels[input.data.workoutType],
      occurredAt: new Date(input.data.occurredAt),
    });

    if (!created) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const { pr, goals, ...workout } = created;

    scheduleCrewPush(() => notifyCrewWorkoutPosted({
      actorUserId: user.id,
      actorDisplayName: user.displayName,
      groupId,
      sessionId: workout.id,
      createdAt: workout.createdAt,
    }));

    return NextResponse.json(
      { pr, goals, workout: withResolvedDisplayName(workout) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Workout could not be created");
  }
}

function describePayloadShape(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return typeof body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === null ? "null" : typeof value]),
  );
}

async function readGroupId(context: RouteContext) {
  const { id } = await context.params;
  const result = groupIdSchema.safeParse(id);
  return result.success ? result.data : null;
}

function handleRouteError(
  error: unknown,
  message: string,
  timing?: ServerTiming,
) {
  if (error instanceof AuthenticationError) {
    const body = { error: "Unauthorized" };
    const init = { status: 401, headers: { "Cache-Control": "no-store" } };
    return timing
      ? timedJson(timing, body, init)
      : NextResponse.json(body, init);
  }

  if (error instanceof WorkoutRequestError) {
    const body = { error: error.message };
    const init = { status: 400, headers: { "Cache-Control": "no-store" } };
    return timing
      ? timedJson(timing, body, init)
      : NextResponse.json(body, init);
  }

  reportUnexpectedRouteError(message, error);
  const body = { error: message };
  const init = { status: 503, headers: { "Cache-Control": "no-store" } };
  return timing
    ? timedJson(timing, body, init)
    : NextResponse.json(body, init);
}
