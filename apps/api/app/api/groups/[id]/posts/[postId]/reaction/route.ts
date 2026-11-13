import {
  removeCommunityPostReactionForMember,
  setCommunityPostReactionForMember,
} from "@repin/db";
import {
  groupIdSchema,
  setCommunityReactionSchema,
  uuidSchema,
} from "@repin/validation";

import {
  notifyCrewReaction,
  scheduleCrewPush,
} from "../../../../../../../lib/crew-push";
import { reportUnexpectedRouteError } from "../../../../../../../lib/sentry";
import {
  AuthenticationError,
  ensureApplicationUser,
  requireAuthenticatedUser,
} from "../../../../../../../lib/supabase-auth";
import {
  ServerTiming,
  timedJson,
} from "../../../../../../../lib/server-timing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; postId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const timing = new ServerTiming();
  try {
    const identity = await requireAuthenticatedUser(request, timing);
    const user = await ensureApplicationUser(identity, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const body: unknown = await request.json().catch(() => null);
    const input = setCommunityReactionSchema.safeParse(body);
    if (!input.success) {
      return timedJson(
        timing,
        { error: "Reaction is invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const reactions = await timing.measure("db", () =>
      setCommunityPostReactionForMember({
        userId: user.id,
        ...target,
        reactionType: input.data.reactionType,
      }));
    if (!reactions) return notFound(timing);

    scheduleCrewPush(() => notifyCrewReaction({
      actorUserId: user.id,
      actorDisplayName: user.displayName,
      groupId: target.groupId,
      postId: target.postId,
      createdAt: new Date(),
    }));

    return timedJson(timing, { reactions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(timing, error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const timing = new ServerTiming();
  try {
    const user = await requireAuthenticatedUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const reactions = await timing.measure("db", () =>
      removeCommunityPostReactionForMember({
        userId: user.id,
        ...target,
      }));
    return reactions
      ? timedJson(timing, { reactions }, { headers: { "Cache-Control": "no-store" } })
      : notFound(timing);
  } catch (error) {
    return handleRouteError(timing, error);
  }
}

async function readTarget(context: RouteContext) {
  const { id, postId } = await context.params;
  const groupId = groupIdSchema.safeParse(id);
  const parsedPostId = uuidSchema.safeParse(postId);
  return groupId.success && parsedPostId.success
    ? { groupId: groupId.data, postId: parsedPostId.data }
    : null;
}

function notFound(timing: ServerTiming) {
  return timedJson(
    timing,
    { error: "Post not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function handleRouteError(timing: ServerTiming, error: unknown) {
  if (error instanceof AuthenticationError) {
    return timedJson(
      timing,
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  reportUnexpectedRouteError("Post reaction could not be updated", error);
  return timedJson(
    timing,
    { error: "Post reaction could not be updated" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
