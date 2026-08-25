import {
  getUserWorkoutSnapshot,
  listGroupsForUser,
  listRecentWorkoutsForAuthorizedGroup,
} from "@repin/db";
import { homeQuerySchema } from "@repin/validation";

import {
  AuthenticationError,
  ensureApplicationUser,
  requireAuthenticatedUser,
} from "../../../lib/supabase-auth";
import { ServerTiming, timedJson } from "../../../lib/server-timing";
import { addAuthorizedWorkoutPhotoUrls } from "../../../lib/workout-photos";
import { withResolvedDisplayName } from "../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const timing = new ServerTiming();

  try {
    const identity = await requireAuthenticatedUser(request, timing);
    const url = new URL(request.url);
    const query = homeQuerySchema.safeParse({
      view: url.searchParams.get("view") ?? undefined,
      groupId: url.searchParams.get("groupId") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes"),
      includeReactions: url.searchParams.get("includeReactions") ?? undefined,
      includeComments: url.searchParams.get("includeComments") ?? undefined,
    });

    if (!query.success) {
      return timedJson(
        timing,
        { error: "Home request parameters are invalid" },
        { status: 400 },
      );
    }

    // Keep the historical social flags as a compatibility path for older app
    // builds. New clients declare the data shape they need explicitly.
    const view = query.data.view ?? (
      query.data.includeReactions || query.data.includeComments
        ? "community"
        : "home"
    );
    const user = view === "community"
      ? null
      : await ensureApplicationUser(identity, timing);
    const groupsPromise = timing.measure("db", () => listGroupsForUser(identity.id));
    const workoutSnapshotPromise = view === "community"
      ? null
      : timing.measure("db", () =>
          getWorkoutSnapshot(
            identity.id,
            query.data.timezoneOffsetMinutes,
          ));
    const groups = await groupsPromise;

    // A client selection can become stale after membership changes. Always fall
    // back to a valid membership so Home and its feed remain usable.
    const selectedGroup =
      groups.find((group) => group.id === query.data.groupId) ?? groups[0];

    if (view === "profile") {
      if (!user) throw new Error("Application user was not provisioned");
      const workoutSnapshot = await workoutSnapshotPromise!;

      return jsonNoStore(timing, {
        user: withResolvedDisplayName(user),
        snapshot: timing.measureSync("enrichment", () =>
          formatWorkoutSnapshot(workoutSnapshot)),
        groups,
        selectedGroupId: selectedGroup?.id ?? null,
      });
    }

    const authorizedCommunityWorkouts = selectedGroup
      ? ((await timing.measure("db", () =>
          listRecentWorkoutsForAuthorizedGroup({
            groupId: selectedGroup.id,
            limit: 20,
            includeReactionCounts: view === "community",
            includeCommentCounts: view === "community",
          }))) ?? [])
      : [];
    const workoutsWithPhotos = view === "community"
      ? await timing.measure("photo", () =>
          addAuthorizedWorkoutPhotoUrls(authorizedCommunityWorkouts))
      : authorizedCommunityWorkouts;
    const communityWorkouts = timing.measureSync("enrichment", () =>
      workoutsWithPhotos.map(withResolvedDisplayName));

    if (view === "community") {
      return jsonNoStore(timing, {
        groups,
        selectedGroupId: selectedGroup?.id ?? null,
        communityWorkouts,
      });
    }

    const workoutSnapshot = await workoutSnapshotPromise!;
    if (!user) throw new Error("Application user was not provisioned");

    return jsonNoStore(timing, {
      user: withResolvedDisplayName(user),
      snapshot: timing.measureSync("enrichment", () =>
        formatWorkoutSnapshot(workoutSnapshot)),
      groups,
      selectedGroupId: selectedGroup?.id ?? null,
      communityWorkouts,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return timedJson(
        timing,
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Home data could not be loaded", error);
    return timedJson(
      timing,
      { error: "Home data could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function getWorkoutSnapshot(
  userId: string,
  timezoneOffsetMinutes: number,
) {
  const now = new Date();
  const { todayStart, weekStart } = getLocalBoundaries(
    now,
    timezoneOffsetMinutes,
  );

  return getUserWorkoutSnapshot({ userId, todayStart, weekStart, now });
}

function formatWorkoutSnapshot(
  workoutSnapshot: Awaited<ReturnType<typeof getUserWorkoutSnapshot>>,
) {
  const hasWorkoutToday = Boolean(workoutSnapshot.mostRecentWorkoutToday);
  const mostRecentWorkoutToday = workoutSnapshot.mostRecentWorkoutToday
    ? withResolvedDisplayName(workoutSnapshot.mostRecentWorkoutToday)
    : null;

  return {
    hasWorkoutToday,
    ...workoutSnapshot,
    mostRecentWorkoutToday,
    message: getSnapshotMessage(
      hasWorkoutToday,
      workoutSnapshot.workoutsThisWeek,
    ),
  };
}

function jsonNoStore(timing: ServerTiming, body: unknown) {
  return timedJson(timing, body, {
    headers: { "Cache-Control": "no-store" },
  });
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
