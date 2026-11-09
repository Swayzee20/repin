import { answerPersonalRecordPrompts } from "@repin/db";
import {
  answerPrPromptsSchema,
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const identifiers = await readIdentifiers(context);
    if (!identifiers) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

    const body: unknown = await request.json().catch(() => null);
    const input = answerPrPromptsSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "PR answers are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const pr = await answerPersonalRecordPrompts({
      userId: user.id,
      groupId: identifiers.groupId,
      sessionId: identifiers.sessionId,
      answers: input.data.answers,
    });
    return NextResponse.json({ pr }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mutationError(error, "PR answers could not be saved");
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
  reportUnexpectedRouteError(message, error);
  return NextResponse.json({ error: message }, { status: 503 });
}
