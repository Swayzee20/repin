import {
  deleteGeneralPostForAuthor,
  GeneralPostRequestError,
  getGeneralPostDetailForMember,
  updateGeneralPostForAuthor,
} from "@repin/db";
import {
  groupIdSchema,
  updateGeneralPostSchema,
  uuidSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { enrichGeneralPost, withSignedGeneralPost } from "../../../../../../lib/general-post-photos";
import { reportUnexpectedRouteError } from "../../../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
  requireAuthenticatedUser,
} from "../../../../../../lib/supabase-auth";
import { ServerTiming, timedJson } from "../../../../../../lib/server-timing";
import { deleteStoredWorkoutPhotos } from "../../../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const timing = new ServerTiming();
  try {
    const user = await requireAuthenticatedUser(request, timing);
    const target = await readTarget(context);
    if (!target) return notFound(timing);

    const detail = await timing.measure("db", () =>
      getGeneralPostDetailForMember({
        viewerUserId: user.id,
        postId: target.postId,
      }));
    if (!detail || detail.groupId !== target.groupId) return notFound(timing);

    const signed = await withSignedGeneralPost(enrichGeneralPost(detail));
    return timedJson(timing, { post: signed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error, "Post could not be loaded", timing);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const input = updateGeneralPostSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Post details are invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const updated = await updateGeneralPostForAuthor({
      authorId: user.id,
      postId: target.postId,
      expectedRevision: input.data.expectedRevision,
      body: input.data.body,
      photoIds: input.data.photoIds,
    });
    if (updated.removedPaths.length) {
      await deleteStoredWorkoutPhotos(updated.removedPaths).catch((error: unknown) => {
        console.error("Replaced general-post photos could not be deleted", error);
      });
    }

    const detail = await getGeneralPostDetailForMember({
      viewerUserId: user.id,
      postId: target.postId,
    });
    const signed = detail ? await withSignedGeneralPost(enrichGeneralPost(detail)) : null;
    return NextResponse.json(
      { post: signed, revision: updated.revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Post could not be saved");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const deleted = await deleteGeneralPostForAuthor({
      authorId: user.id,
      postId: target.postId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (deleted.removedPaths.length) {
      await deleteStoredWorkoutPhotos(deleted.removedPaths).catch((error: unknown) => {
        console.error("Deleted general-post photos could not be removed", error);
      });
    }
    return NextResponse.json(
      { deleted: true, groupIds: deleted.groupIds },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Post could not be deleted");
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

function handleRouteError(error: unknown, message: string, timing?: ServerTiming) {
  if (error instanceof AuthenticationError) {
    const body = { error: "Unauthorized" };
    const init = { status: 401, headers: { "Cache-Control": "no-store" } };
    return timing ? timedJson(timing, body, init) : NextResponse.json(body, init);
  }
  if (error instanceof GeneralPostRequestError) {
    const body = { error: error.message, code: error.code };
    const init = { status: error.statusCode, headers: { "Cache-Control": "no-store" } };
    return timing ? timedJson(timing, body, init) : NextResponse.json(body, init);
  }
  reportUnexpectedRouteError(message, error);
  const body = { error: message };
  const init = { status: 503, headers: { "Cache-Control": "no-store" } };
  return timing ? timedJson(timing, body, init) : NextResponse.json(body, init);
}
