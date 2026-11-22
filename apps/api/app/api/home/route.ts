import {
  countActiveMembersByGroupIds,
  getCrewBoardSummary,
  getPinnedGeneralPostForMember,
  getUserWeeklyStreak,
  getUserWorkoutSnapshot,
  hydrateGeneralFeedItems,
  listActiveGoalSnapshotsForHome,
  listCommunityFeedForMember,
  listCrewHighlightsForHome,
  listGroupsForUser,
  listLatestCommentsForPosts,
  listRecentWorkoutsForAuthorizedGroup,
  listViewerReactionsForPosts,
} from "@repin/db";
import type {
  CommunityFeedItem,
  GeneralPostFeedItem,
  HomeCrewHighlights,
  WorkoutFeedItem,
} from "@repin/types";
import {
  HOME_ACTIVITY_LIMIT,
  homeLocalBounds,
  homeQuerySchema,
  skipLegacyCommunityWorkoutsQuery,
} from "@repin/validation";

import { signCrewPhotoUrl } from "../../../lib/crew-photos";
import { reportUnexpectedRouteError } from "../../../lib/sentry";
import {
  AuthenticationError,
  ensureApplicationUser,
  requireAuthenticatedUser,
} from "../../../lib/supabase-auth";
import { ServerTiming, timedJson } from "../../../lib/server-timing";
import { addAuthorizedWorkoutPhotoUrls, signWorkoutPhotoPaths } from "../../../lib/workout-photos";
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
      feed: url.searchParams.get("feed") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      groupId: url.searchParams.get("groupId") ?? undefined,
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes") ?? undefined,
      start: url.searchParams.get("start") ?? undefined,
      end: url.searchParams.get("end") ?? undefined,
      includeReactions: url.searchParams.get("includeReactions") ?? undefined,
      includeComments: url.searchParams.get("includeComments") ?? undefined,
      v: url.searchParams.get("v") ?? undefined,
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
          getWorkoutSnapshot(identity.id, {
            timeZone: query.data.timeZone,
            timezoneOffsetMinutes: query.data.timezoneOffsetMinutes,
          }));
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

    const now = new Date();
    const bounds = homeLocalBounds(now, query.data);
    const homeFeed = view === "home";
    const skipLegacyCommunityWorkouts = skipLegacyCommunityWorkoutsQuery({
      view,
      feed: query.data.feed,
      v: query.data.v,
    });
    const authorizedCommunityWorkouts = selectedGroup && !skipLegacyCommunityWorkouts
      ? ((await timing.measure("db", () =>
          listRecentWorkoutsForAuthorizedGroup({
            groupId: selectedGroup.id,
            viewerUserId: identity.id,
            limit: homeFeed ? HOME_ACTIVITY_LIMIT : 20,
            includeReactionCounts: view === "community",
            includeCommentCounts: view === "community",
            occurredAtStart: homeFeed
              ? bounds.weekStart
              : query.data.start ? new Date(query.data.start) : undefined,
            occurredAtEnd: homeFeed
              ? bounds.weekEnd
              : query.data.end ? new Date(query.data.end) : undefined,
          }))) ?? [])
      : [];
    const workoutsWithPhotos = view === "community" && !skipLegacyCommunityWorkouts
      ? await timing.measure("photo", () =>
          addAuthorizedWorkoutPhotoUrls(authorizedCommunityWorkouts))
      : authorizedCommunityWorkouts;
    const communityWorkouts = timing.measureSync("enrichment", () =>
      workoutsWithPhotos.map(withResolvedDisplayName));

    if (view === "community") {
      const groupsWithCounts = await timing.measure("db", () => withMemberCounts(groups));
      if (query.data.feed === "mixed" && selectedGroup) {
        const mixed = await timing.measure("db", () =>
          listMixedCommunityFeed({
            groupId: selectedGroup.id,
            viewerUserId: identity.id,
            cursor: query.data.cursor,
            limit: query.data.limit,
          }));
        const crew = query.data.cursor
          ? undefined
          : await timing.measure("db", () => loadCrewSummary({
            groupId: selectedGroup.id,
            viewerUserId: identity.id,
            photoPath: selectedGroup.photoPath,
            bounds,
            timeZone: query.data.timeZone ?? "UTC",
          }));
        return jsonNoStore(timing, {
          groups: groupsWithCounts,
          selectedGroupId: selectedGroup.id,
          communityWorkouts,
          crew,
          ...mixed,
        });
      }
      return jsonNoStore(timing, {
        groups: groupsWithCounts,
        selectedGroupId: selectedGroup?.id ?? null,
        communityWorkouts,
      });
    }

    const workoutSnapshot = await workoutSnapshotPromise!;
    if (!user) throw new Error("Application user was not provisioned");

    const timeZone = query.data.timeZone ?? "UTC";
    const [goals, streak, crewHighlights] = await Promise.all([
      timing.measure("db", () => listActiveGoalSnapshotsForHome(identity.id, now)),
      timing.measure("db", () => getUserWeeklyStreak({ userId: identity.id, timeZone, now })),
      selectedGroup
        ? timing.measure("db", () => listCrewHighlightsForHome({
          groupId: selectedGroup.id,
          viewerUserId: identity.id,
          todayStart: bounds.todayStart,
          weekStart: bounds.weekStart,
          weekEnd: bounds.weekEnd,
          now,
          timeZone: query.data.timeZone ?? "UTC",
        }))
        : Promise.resolve({ firstToRepInToday: null, weekly: [] } satisfies HomeCrewHighlights),
    ]);

    return jsonNoStore(timing, {
      user: withResolvedDisplayName(user),
      snapshot: timing.measureSync("enrichment", () =>
        formatWorkoutSnapshot(workoutSnapshot)),
      groups,
      selectedGroupId: selectedGroup?.id ?? null,
      communityWorkouts,
      goals,
      streak,
      crewHighlights: namedCrewHighlights(crewHighlights),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return timedJson(
        timing,
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    reportUnexpectedRouteError("Home data could not be loaded", error);
    return timedJson(
      timing,
      { error: "Home data could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function getWorkoutSnapshot(
  userId: string,
  query: { timeZone?: string; timezoneOffsetMinutes?: number },
) {
  const now = new Date();
  const { todayStart, weekStart, weekEnd } = homeLocalBounds(now, query);

  return getUserWorkoutSnapshot({ userId, todayStart, weekStart, weekEnd, now });
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

async function listMixedCommunityFeed(input: {
  groupId: string;
  viewerUserId: string;
  cursor?: string;
  limit?: number;
}) {
  const page = await listCommunityFeedForMember({
    viewerUserId: input.viewerUserId,
    groupId: input.groupId,
    cursor: input.cursor,
    limit: input.limit,
  });
  if (!page) {
    return {
      communityFeed: [] as CommunityFeedItem[],
      pinnedPost: null,
      nextCursor: null,
    };
  }

  const workoutSessionIds = page.items.flatMap((row) =>
    row.kind === "workout" && row.workoutSessionId ? [row.workoutSessionId] : []);
  const workouts = workoutSessionIds.length
    ? ((await listRecentWorkoutsForAuthorizedGroup({
        groupId: input.groupId,
        viewerUserId: input.viewerUserId,
        sessionIds: workoutSessionIds,
        limit: workoutSessionIds.length,
        includeReactionCounts: true,
        includeCommentCounts: true,
      })) ?? [])
    : [];
  const workoutsWithPhotos = await addAuthorizedWorkoutPhotoUrls(workouts);
  const workoutBySession = new Map(
    workoutsWithPhotos.map((workout) => [workout.id, toWorkoutFeedItem(workout)]),
  );

  const generals = await signGeneralPostPhotos(
    hydrateGeneralFeedItems(
      page.items.filter((row) => row.kind === "general"),
      page.publications,
    ),
  );
  const generalById = new Map(generals.map((item) => [item.id, item]));

  const communityFeed: CommunityFeedItem[] = [];
  for (const row of page.items) {
    if (row.kind === "general") {
      const item = generalById.get(row.id);
      if (item) communityFeed.push(item);
      continue;
    }
    const item = row.workoutSessionId ? workoutBySession.get(row.workoutSessionId) : undefined;
    if (item) communityFeed.push(item);
  }

  const pinned = input.cursor
    ? null
    : await getPinnedGeneralPostForMember({
      viewerUserId: input.viewerUserId,
      groupId: input.groupId,
    });
  const pinnedPost = pinned ? (await signGeneralPostPhotos([pinned]))[0] ?? null : null;
  const withSocial = await attachFeedSocial(input.viewerUserId, communityFeed, pinnedPost);

  return {
    communityFeed: withSocial.communityFeed,
    pinnedPost: withSocial.pinnedPost,
    nextCursor: page.nextCursor,
  };
}

async function attachFeedSocial(
  viewerUserId: string,
  communityFeed: CommunityFeedItem[],
  pinnedPost: GeneralPostFeedItem | null,
) {
  const items = pinnedPost ? [pinnedPost, ...communityFeed] : communityFeed;
  const postIds = items.map(feedPostId).filter((id): id is string => Boolean(id));
  const [comments, reactions] = await Promise.all([
    listLatestCommentsForPosts({ viewerUserId, postIds }),
    listViewerReactionsForPosts({ viewerUserId, postIds }),
  ]);
  const apply = <T extends CommunityFeedItem>(item: T): T => {
    const postId = feedPostId(item);
    return {
      ...item,
      latestComment: (postId ? comments.get(postId) : null) ?? null,
      viewerReaction: (postId ? reactions.get(postId) : null) ?? null,
    };
  };
  return {
    communityFeed: communityFeed.map(apply),
    pinnedPost: pinnedPost ? apply(pinnedPost) : null,
  };
}

function feedPostId(item: CommunityFeedItem) {
  if (item.kind === "general") return item.id;
  return item.communityPostId ?? null;
}

async function withMemberCounts<T extends { id: string }>(groups: T[]) {
  const counts = await countActiveMembersByGroupIds(groups.map((group) => group.id));
  return groups.map((group) => ({
    ...group,
    memberCount: counts.get(group.id) ?? 0,
  }));
}

async function loadCrewSummary(input: {
  groupId: string;
  viewerUserId: string;
  photoPath?: string | null;
  bounds: ReturnType<typeof homeLocalBounds>;
  timeZone: string;
}) {
  const summary = await getCrewBoardSummary({
    groupId: input.groupId,
    viewerUserId: input.viewerUserId,
    weekStart: input.bounds.weekStart,
    weekEnd: input.bounds.weekEnd,
    rangeEnd: new Date(),
    todayStart: input.bounds.todayStart,
    timeZone: input.timeZone,
  });
  if (!summary) return null;
  const photoUrl = await signCrewPhotoUrl(input.photoPath ?? null).catch(() => null);
  return { ...summary, photoUrl };
}

function toIso(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  return value ?? undefined;
}

function toWorkoutFeedItem(workout: {
  displayName: string;
  occurredAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt: Date | string;
}): WorkoutFeedItem {
  const named = withResolvedDisplayName(workout);
  return {
    ...(named as unknown as WorkoutFeedItem),
    kind: "workout",
    occurredAt: toIso(named.occurredAt) ?? null,
    completedAt: toIso(named.completedAt) ?? null,
    createdAt: toIso(named.createdAt) ?? null,
    updatedAt: toIso(named.updatedAt) ?? new Date(0).toISOString(),
  };
}

async function signGeneralPostPhotos(items: GeneralPostFeedItem[]) {
  const paths = items.flatMap((item) => item.photos.map((photo) => photo.path));
  const urls = await signWorkoutPhotoPaths(paths);
  return items.map((item) => ({
    ...withResolvedDisplayName(item),
    photos: item.photos.map((photo) => ({
      ...photo,
      url: urls.get(photo.path) ?? null,
    })),
  }));
}

function namedCrewHighlights(highlights: HomeCrewHighlights): HomeCrewHighlights {
  return {
    firstToRepInToday: highlights.firstToRepInToday
      ? withResolvedDisplayName(highlights.firstToRepInToday)
      : null,
    weekly: highlights.weekly.map(withResolvedDisplayName),
  };
}

function jsonNoStore(timing: ServerTiming, body: unknown) {
  return timedJson(timing, body, {
    headers: { "Cache-Control": "no-store" },
  });
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
