import {
  GeneralPostRequestError,
  reserveGeneralPostPhoto,
} from "@repin/db";
import { reserveGeneralPostPhotoSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";
import { createWorkoutPhotoSignedUpload } from "../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = reserveGeneralPostPhotoSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Photo details are invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const reservation = await reserveGeneralPostPhoto({
      authorId: user.id,
      publicationId: input.data.publicationId,
      contentType: input.data.contentType,
      byteSize: input.data.byteSize,
    });
    const upload = await createWorkoutPhotoSignedUpload(reservation.storagePath);

    return NextResponse.json(
      {
        reservationId: reservation.id,
        publicationId: reservation.publicationId,
        storagePath: reservation.storagePath,
        contentType: reservation.contentType,
        byteSize: reservation.byteSize,
        upload,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
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
    reportUnexpectedRouteError("Photo reservation could not be created", error);
    return NextResponse.json(
      { error: "Photo reservation could not be created" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
