import {
  GeneralPostRequestError,
  publishGeneralPost,
} from "@repin/db";
import { createGeneralPostSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  notifyCrewPostPosted,
  scheduleCrewPush,
} from "../../../lib/crew-push";
import { reportUnexpectedRouteError } from "../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";
import { deleteStoredWorkoutPhotos } from "../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = createGeneralPostSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Post details are invalid", issues: input.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const published = await publishGeneralPost({
      authorId: user.id,
      publicationId: input.data.publicationId,
      body: input.data.body,
      groupIds: input.data.groupIds,
      photoIds: input.data.photoIds,
    });

    scheduleCrewPush(() => notifyCrewPostPosted({
      actorUserId: user.id,
      actorDisplayName: user.displayName,
      publicationId: published.publicationId,
      createdAt: published.posts[0]?.createdAt ?? new Date(),
      body: published.body,
    }));

    if (published.removedPaths.length) {
      await deleteStoredWorkoutPhotos(published.removedPaths).catch((error: unknown) => {
        console.error("Unused general-post photos could not be deleted", error);
      });
    }

    return NextResponse.json(
      {
        publicationId: published.publicationId,
        posts: published.posts,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Post could not be created");
  }
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
