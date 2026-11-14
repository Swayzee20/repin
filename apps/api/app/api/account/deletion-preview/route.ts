import { previewAccountDeletion } from "@repin/db";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedUser(request);
    const preview = await previewAccountDeletion(identity.id);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    reportUnexpectedRouteError("Crews could not be loaded", error);
    return NextResponse.json(
      { error: "Couldn't load your crews." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
