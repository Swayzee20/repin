import {
  completeGeneralPostPhotoReservation,
  getGeneralPostPhotoReservation,
  GeneralPostRequestError,
} from "@repin/db";
import { completeGeneralPostPhotoSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";
import { workoutPhotoObjectExists } from "../../../../../lib/workout-photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = completeGeneralPostPhotoSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Photo reservation is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const reservation = await getGeneralPostPhotoReservation({
      authorId: user.id,
      reservationId: input.data.reservationId,
    });
    if (!reservation) {
      return NextResponse.json(
        { error: "Photo reservation was not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const uploaded = await workoutPhotoObjectExists(reservation.storagePath);
    const completed = await completeGeneralPostPhotoReservation({
      authorId: user.id,
      reservationId: input.data.reservationId,
      uploaded,
    });
    if (!completed) {
      return NextResponse.json(
        { error: "Photo reservation was not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        reservationId: completed.id,
        publicationId: completed.publicationId,
        storagePath: completed.storagePath,
        status: completed.status,
        uploaded,
      },
      { headers: { "Cache-Control": "no-store" } },
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
    reportUnexpectedRouteError("Photo upload could not be verified", error);
    return NextResponse.json(
      { error: "Photo upload could not be verified" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
