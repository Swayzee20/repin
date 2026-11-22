import { listCrewActivityForMember } from "@repin/db";
import { crewActivityQuerySchema, groupIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleCrewMutationError } from "../../../../../lib/crew-route";
import { reportUnexpectedRouteError } from "../../../../../lib/sentry";
import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../../../lib/supabase-auth";
import { withResolvedDisplayName } from "../../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    if (!groupId.success) {
      return NextResponse.json({ error: "Invalid crew ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const query = crewActivityQuerySchema.safeParse({
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes") ?? undefined,
      before: url.searchParams.get("before") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Invalid activity request" }, { status: 400 });
    }

    const activity = await listCrewActivityForMember({
      groupId: groupId.data,
      viewerUserId: user.id,
      now: new Date(),
      before: query.data.before ? new Date(query.data.before) : undefined,
    });
    if (!activity) {
      return NextResponse.json({ error: "Crew not found" }, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({
      activity: {
        items: activity.items.map((item) => ({
          ...item,
          actorDisplayName: withResolvedDisplayName({ displayName: item.actorDisplayName }).displayName,
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    reportUnexpectedRouteError("Crew activity could not be loaded", error);
    return handleCrewMutationError(error, "Crew activity could not be loaded");
  }
}
