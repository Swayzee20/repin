import {
  getUserWorkoutSnapshot,
  listGroupsForUser,
  listRecentWorkoutsForMember,
} from "@repin/db";
import { homeQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

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
    const query = homeQuerySchema.safeParse({
      groupId: url.searchParams.get("groupId") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes"),
    });

    if (!query.success) {
      return NextResponse.json(
        { error: "Home request parameters are invalid" },
        { status: 400 },
      );
    }

    const now = new Date();
    const { todayStart, weekStart } = getLocalBoundaries(
      now,
      query.data.timezoneOffsetMinutes,
    );
    const [groups, workoutSnapshot] = await Promise.all([
      listGroupsForUser(user.id),
      getUserWorkoutSnapshot({ userId: user.id, todayStart, weekStart, now }),
    ]);

    // A client selection can become stale after membership changes. Always fall
    // back to a valid membership so Home and its feed remain usable.
    const selectedGroup =
      groups.find((group) => group.id === query.data.groupId) ?? groups[0];

    const communityWorkouts = selectedGroup
      ? ((await listRecentWorkoutsForMember({
          userId: user.id,
          groupId: selectedGroup.id,
          limit: 20,
        })) ?? [])
      : [];
    const hasWorkoutToday = Boolean(workoutSnapshot.mostRecentWorkoutToday);

    return NextResponse.json(
      {
        user,
        snapshot: {
          hasWorkoutToday,
          ...workoutSnapshot,
          message: getSnapshotMessage(
            hasWorkoutToday,
            workoutSnapshot.workoutsThisWeek,
          ),
        },
        groups,
        selectedGroupId: selectedGroup?.id ?? null,
        communityWorkouts,
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

    console.error("Home data could not be loaded", error);
    return NextResponse.json(
      { error: "Home data could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function getLocalBoundaries(now: Date, timezoneOffsetMinutes: number) {
  const localNow = new Date(
    now.getTime() - timezoneOffsetMinutes * 60 * 1_000,
  );
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const todayStart = new Date(
    localMidnight + timezoneOffsetMinutes * 60 * 1_000,
  );
  const daysSinceMonday = (localNow.getUTCDay() + 6) % 7;
  const weekStart = new Date(
    todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1_000,
  );

  return { todayStart, weekStart };
}

function getSnapshotMessage(hasWorkoutToday: boolean, workoutsThisWeek: number) {
  if (hasWorkoutToday && workoutsThisWeek > 0) {
    return `You logged your ${ordinal(workoutsThisWeek)} workout this week.`;
  }

  if (workoutsThisWeek > 0) {
    return `You’ve completed ${workoutsThisWeek} workout${workoutsThisWeek === 1 ? "" : "s"} this week.`;
  }

  return "Your next workout can start the week.";
}

function ordinal(value: number) {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
