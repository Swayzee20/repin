import { reopenGoalForUser } from "@repin/db";
import { goalIdSchema, reopenGoalSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleGoalRouteError } from "../../../../../lib/goals-route";
import { requireApplicationUser } from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { id } = await context.params;
    const goalId = goalIdSchema.safeParse(id);
    if (!goalId.success) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const raw = await request.text();
    const body: unknown = raw.trim() ? JSON.parse(raw) : {};
    const input = reopenGoalSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Goal could not be reopened", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const goal = await reopenGoalForUser({
      userId: user.id,
      goalId: goalId.data,
      deadlineAt: input.data.deadlineAt ?? undefined,
    });
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ goal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleGoalRouteError(error, "Goal could not be reopened");
  }
}
