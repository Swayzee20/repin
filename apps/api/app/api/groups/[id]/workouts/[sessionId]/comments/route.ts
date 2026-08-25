import {
  createCommunityPostCommentForMember,
  listCommunityPostCommentsForMember,
} from "@repin/db";
import {
  createCommunityCommentSchema,
  groupIdSchema,
  workoutSessionIdSchema,
} from "@repin/validation";

import {
  AuthenticationError,
  requireAuthenticatedUser,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";
import {
  ServerTiming,
  timedJson,
} from "../../../../../../../lib/server-timing";
import { withResolvedDisplayName } from "../../../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireAuthenticatedUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const comments = await timing.measure("db", () =>
      listCommunityPostCommentsForMember({
        userId: user.id,
        ...target,
      }));

    return comments
      ? timedJson(
          timing,
          {
            comments: timing.measureSync("enrichment", () =>
              comments.map(withResolvedDisplayName)),
          },
          { headers: { "Cache-Control": "no-store" } },
        )
      : notFound(timing);
  } catch (error) {
    return handleRouteError(
      timing,
      error,
      "Community comments could not be loaded",
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const timing = new ServerTiming();

  try {
    const user = await requireApplicationUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const body: unknown = await request.json().catch(() => null);
    const input = createCommunityCommentSchema.safeParse(body);
    if (!input.success) {
      return timedJson(
        timing,
        { error: "Comment is invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const comment = await timing.measure("db", () =>
      createCommunityPostCommentForMember({
        userId: user.id,
        displayName: user.displayName,
        ...target,
        text: input.data.text,
      }));

    return comment
      ? timedJson(
          timing,
          {
            comment: timing.measureSync("enrichment", () =>
              withResolvedDisplayName(comment)),
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        )
      : notFound(timing);
  } catch (error) {
    return handleRouteError(
      timing,
      error,
      "Community comment could not be created",
    );
  }
}

async function readTarget(context: RouteContext) {
  const { id, sessionId } = await context.params;
  const groupId = groupIdSchema.safeParse(id);
  const workoutSessionId = workoutSessionIdSchema.safeParse(sessionId);

  return groupId.success && workoutSessionId.success
    ? { groupId: groupId.data, workoutSessionId: workoutSessionId.data }
    : null;
}

function notFound(timing: ServerTiming) {
  return timedJson(
    timing,
    { error: "Workout not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function handleRouteError(
  timing: ServerTiming,
  error: unknown,
  message: string,
) {
  if (error instanceof AuthenticationError) {
    return timedJson(
      timing,
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(message, error);
  return timedJson(
    timing,
    { error: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
