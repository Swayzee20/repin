import { getLastMovementSessionForUser } from "@repin/db";
import { movementLastSessionQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const query = movementLastSessionQuerySchema.safeParse({
      movementId: url.searchParams.get("movementId") ?? undefined,
      movementName: url.searchParams.get("movementName") ?? undefined,
    });

    if (!query.success) {
      return NextResponse.json({ error: "Movement last session is invalid" }, { status: 400 });
    }

    const lastSession = await getLastMovementSessionForUser({
      userId: user.id,
      movementId: query.data.movementId,
      movementName: query.data.movementName,
    });

    return NextResponse.json(
      { lastSession },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    reportUnexpectedRouteError("Last session could not be loaded", error);
    return NextResponse.json(
      { error: "Last session could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
