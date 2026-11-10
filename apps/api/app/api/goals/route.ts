import { createGoalForUser, listGoalsForUser } from "@repin/db";
import {
  createGoalSchema,
  resolvedSchedule,
  resolvedTimeTargetSeconds,
  resolvedVolumeMetric,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { handleGoalRouteError } from "../../../lib/goals-route";
import { requireApplicationUser } from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const goals = await listGoalsForUser(user.id);
    return NextResponse.json(goals, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goals could not be loaded");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = createGoalSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Goal details are invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const metric = resolvedVolumeMetric(input.data.kind, input.data.metric);
    const goal = await createGoalForUser({
      userId: user.id,
      kind: input.data.kind,
      metric,
      sportFilter: input.data.sportFilter ?? null,
      target: input.data.kind === "time"
        ? resolvedTimeTargetSeconds(input.data)
        : input.data.target,
      displayUnit: input.data.displayUnit ?? (input.data.kind === "lift" ? "lb" : input.data.kind === "volume" && metric === "distance" ? "mi" : null),
      schedule: resolvedSchedule(input.data.kind, input.data.schedule),
      deadlineAt: input.data.deadlineAt ? new Date(input.data.deadlineAt) : null,
      timeZone: input.data.timeZone,
      movementId: input.data.movementId ?? null,
      movementName: input.data.movementName ?? null,
      lane: input.data.lane ?? null,
    });
    return NextResponse.json({ goal }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal could not be created");
  }
}
