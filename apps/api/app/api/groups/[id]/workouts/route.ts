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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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

    return NextResponse.json(
      { workouts },
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
      return NextResponse.json(
        { error: "Workout details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const workout = await createWorkoutForMember({
      userId: user.id,
      displayName: user.displayName,
      groupId,
      ...input.data,
      completedAt: new Date(input.data.completedAt),
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

