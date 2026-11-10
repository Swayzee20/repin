import {
  deleteGoalForUser,
  getGoalForUser,
  updateGoalForUser,
} from "@repin/db";
import {
  createGoalSchema,
  goalIdSchema,
  resolvedSchedule,
  resolvedTimeTargetSeconds,
  resolvedVolumeMetric,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { handleGoalRouteError } from "../../../../lib/goals-route";
import { requireApplicationUser } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const goalId = await readGoalId(context);
    if (!goalId) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const goal = await getGoalForUser(user.id, goalId);
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ goal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal could not be loaded");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const goalId = await readGoalId(context);
    if (!goalId) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const body: unknown = await request.json().catch(() => null);
    const input = createGoalSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Goal details are invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const metric = resolvedVolumeMetric(input.data.kind, input.data.metric);
    const goal = await updateGoalForUser({
      goalId,
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
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ goal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal could not be saved");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const goalId = await readGoalId(context);
    if (!goalId) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const deleted = await deleteGoalForUser(user.id, goalId);
    if (!deleted) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal could not be deleted");
  }
}

async function readGoalId(context: RouteContext) {
  const { id } = await context.params;
  const parsed = goalIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}
