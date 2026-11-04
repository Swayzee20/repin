import { listRecentMovementsForUser, searchMovements } from "@repin/db";
import { movementSearchQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const query = movementSearchQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? "",
      recent: url.searchParams.get("recent") ?? undefined,
    });

    if (!query.success) {
      return NextResponse.json({ error: "Movement search is invalid" }, { status: 400 });
    }

    const movements = await searchMovements({ query: query.data.q });
    if (!query.data.recent) {
      return NextResponse.json(
        { movements },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const recents = await listRecentMovementsForUser(user.id);
    return NextResponse.json(
      {
        movements,
        recent: recents.recent,
        recentCustom: recents.recentCustom,
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

    reportUnexpectedRouteError("Movements could not be loaded", error);
    return NextResponse.json(
      { error: "Movements could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
