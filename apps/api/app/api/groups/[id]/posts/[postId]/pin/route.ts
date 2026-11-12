import {
  GeneralPostRequestError,
  pinGeneralPostForOwner,
  unpinGeneralPostForOwner,
} from "@repin/db";
import {
  groupIdSchema,
  pinGeneralPostSchema,
  uuidSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const body: unknown = await request.json().catch(() => null);
    const input = pinGeneralPostSchema.safeParse(body ?? {});
    if (!input.success) {
      return NextResponse.json(
        { error: "Pin request is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await pinGeneralPostForOwner({
      actorId: user.id,
      postId: target.postId,
      replace: input.data.replace,
    });
    if (result.groupId !== target.groupId) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (result.needsReplaceConfirm) {
      return NextResponse.json(
        { needsReplaceConfirm: true, postId: result.postId },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { pinned: true, postId: result.postId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Post could not be pinned");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const target = await readTarget(context);
    if (!target) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const result = await unpinGeneralPostForOwner({
      actorId: user.id,
      postId: target.postId,
    });
    if (result.groupId !== target.groupId) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json(
      { unpinned: true, postId: result.postId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Post could not be unpinned");
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

function handleRouteError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof GeneralPostRequestError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode, headers: { "Cache-Control": "no-store" } },
    );
  }
  reportUnexpectedRouteError(message, error);
  return NextResponse.json(
    { error: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
