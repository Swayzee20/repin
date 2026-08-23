import {
  createWorkoutForMember,
  listRecentWorkoutsForMember,
} from "@repin/db";
import { createWorkoutSchema, groupIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";
import { addAuthorizedWorkoutPhotoUrls } from "../../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const workoutTypeLabels = {
  run: "Run",
  walk: "Walk",
  strength_training: "Strength Training",
  powerlifting: "Powerlifting",
  hiit: "HIIT",
  functional_fitness: "Functional Fitness",
  other: "Other",
} as const;

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const groupId = await readGroupId(context);

    if (!groupId) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const workouts = await listRecentWorkoutsForMember({
      userId: user.id,
      groupId,
    });

    if (!workouts) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const workoutsWithPhotoUrls = await addAuthorizedWorkoutPhotoUrls(workouts);

    return NextResponse.json(
      { workouts: workoutsWithPhotoUrls },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Workouts could not be loaded");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const groupId = await readGroupId(context);

    if (!groupId) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
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

    const workout = await createWorkoutForMember({
      userId: user.id,
      displayName: user.displayName,
      groupId,
      ...input.data,
      title: input.data.name ?? workoutTypeLabels[input.data.workoutType],
      occurredAt: new Date(input.data.occurredAt),
    });

    if (!workout) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json(
      { workout },
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
