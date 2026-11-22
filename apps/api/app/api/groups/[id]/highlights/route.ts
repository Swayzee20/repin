import { countActiveMembersByGroupIds, listCrewHighlightsForMember } from "@repin/db";
import {
  crewWeekQuerySchema,
  groupIdSchema,
  resolveCrewWeekWindow,
} from "@repin/validation";
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
    const query = crewWeekQuerySchema.safeParse({
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes") ?? undefined,
      week: url.searchParams.get("week") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Invalid highlights request" }, { status: 400 });
    }

    const now = new Date();
    const week = query.data.week ?? "current";
    const bounds = resolveCrewWeekWindow(now, query.data, week);
    const highlights = await listCrewHighlightsForMember({
      groupId: groupId.data,
      viewerUserId: user.id,
      weekStart: bounds.weekStart,
      weekEnd: bounds.weekEnd,
      rangeEnd: bounds.rangeEnd,
      todayStart: bounds.todayStart,
      timeZone: query.data.timeZone ?? "UTC",
    });
    if (!highlights) {
      return NextResponse.json({ error: "Crew not found" }, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const counts = await countActiveMembersByGroupIds([groupId.data]);

    return NextResponse.json({
      week,
      memberCount: counts.get(groupId.data) ?? 0,
      highlights: {
        firstToRepInToday: highlights.firstToRepInToday
          ? withResolvedDisplayName(highlights.firstToRepInToday)
          : null,
        weekly: highlights.weekly.map(withResolvedDisplayName),
        consistent: highlights.consistent.map(withResolvedDisplayName),
        sharedPrs: highlights.sharedPrs.map(withResolvedDisplayName),
        sharedGoals: highlights.sharedGoals.map(withResolvedDisplayName),
        mostCheered: highlights.mostCheered
          ? withResolvedDisplayName(highlights.mostCheered)
          : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    reportUnexpectedRouteError("Crew highlights could not be loaded", error);
    return handleCrewMutationError(error, "Crew highlights could not be loaded");
  }
}
