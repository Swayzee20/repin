import "server-only";

import type {
  CommunityActivity,
  CommunityCrewSummary,
  CommunityHighlights,
  CommunityLatestComment,
  CommunityProgress,
  CommunityReactionType,
  CommunityWhoReacted,
} from "@repin/types";
import {
  CREW_ACTIVITY_DAYS,
  CREW_ACTIVITY_LIMIT,
  HIGHLIGHT_BADGE_LIMIT,
  HIGHLIGHT_CONSISTENT_DAYS,
  HIGHLIGHT_WEEKLY_MIN,
  highlightCountOf,
  localWeekdayIndex,
  truncateCommentPreview,
  weekdayLetters,
} from "@repin/validation";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";

import { getDatabase } from "./connection";
import { listCrewMembers } from "./crew";
import { listBlockedUsersForMember } from "./moderation";
import type { GoalSessionSnapshot } from "./goal-credit";
import { activeMembership, openGroup, viewerActiveMembership } from "./membership";
import {
  aggregatePeriodStats,
  dashboardSessionContribution,
} from "./profile-dashboard-stats";
import * as schema from "./schema";
import {
  communityCommentVisibleToSql,
  communityPostVisibleToSql,
  communityReactionVisibleToSql,
} from "./visibility";

const workoutVisible = (viewerUserId: string) => and(
  eq(schema.communityPosts.kind, "workout"),
  sql`${schema.communityPosts.workoutSessionId} is not null`,
  communityPostVisibleToSql(viewerUserId, schema.communityPosts.id),
);

export async function requireGroupForMember(input: { groupId: string; userId: string }) {
  const [group] = await getDatabase()
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      photoPath: schema.groups.photoPath,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(and(
      eq(schema.groupMembers.groupId, input.groupId),
      viewerActiveMembership(input.userId),
      openGroup,
    ))
    .limit(1);
  return group ?? null;
}

export async function countActiveMembersByGroupIds(groupIds: string[]) {
  if (!groupIds.length) return new Map<string, number>();
  const rows = await getDatabase()
    .select({
      groupId: schema.groupMembers.groupId,
      value: count(),
    })
    .from(schema.groupMembers)
    .where(and(
      inArray(schema.groupMembers.groupId, groupIds),
      activeMembership,
    ))
    .groupBy(schema.groupMembers.groupId);
  return new Map(rows.map((row) => [row.groupId, row.value]));
}

export async function listVisibleWorkoutPostsInWeek(input: {
  groupId: string;
  viewerUserId: string;
  weekStart: Date;
  weekEnd: Date;
  rangeEnd: Date;
}) {
  return getDatabase()
    .select({
      postId: schema.communityPosts.id,
      sessionId: schema.communityPosts.workoutSessionId,
      userId: schema.communityPosts.userId,
      displayName: schema.users.displayName,
      occurredAt: schema.workoutSessions.occurredAt,
      createdAt: schema.communityPosts.createdAt,
      title: schema.workoutSessions.name,
      reactionCount: visibleTotalReactionCountSql(input.viewerUserId),
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .innerJoin(schema.users, eq(schema.communityPosts.userId, schema.users.id))
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      workoutVisible(input.viewerUserId),
      gte(schema.workoutSessions.occurredAt, input.weekStart),
      lte(schema.workoutSessions.occurredAt, input.rangeEnd),
      lt(schema.workoutSessions.occurredAt, input.weekEnd),
    ))
    .orderBy(asc(schema.workoutSessions.occurredAt), asc(schema.communityPosts.createdAt));
}

export async function getCrewBoardSummary(input: {
  groupId: string;
  viewerUserId: string;
  weekStart: Date;
  weekEnd: Date;
  rangeEnd: Date;
  todayStart: Date | null;
  timeZone: string;
}): Promise<Omit<CommunityCrewSummary, "photoUrl"> | null> {
  const group = await requireGroupForMember({ groupId: input.groupId, userId: input.viewerUserId });
  if (!group) return null;
  const [memberCount, posts, highlights] = await Promise.all([
    countActiveMembers(input.groupId),
    listVisibleWorkoutPostsInWeek(input),
    listCrewHighlightsForMember(input).then((value) => value ?? {
      firstToRepInToday: null,
      weekly: [],
      consistent: [],
      sharedPrs: [],
      sharedGoals: [],
      mostCheered: null,
    }),
  ]);
  const activeMembers = new Set(posts.map((post) => post.userId)).size;
  return {
    memberCount,
    weekPulse: {
      activeMembers,
      sharedWorkouts: posts.length,
    },
    highlightCount: highlightCountOf(highlights, memberCount),
  };
}

export async function getCrewProgressForMember(input: {
  groupId: string;
  viewerUserId: string;
  weekStart: Date;
  weekEnd: Date;
  rangeEnd: Date;
  todayStart: Date | null;
  timeZone: string;
}): Promise<CommunityProgress | null> {
  const group = await requireGroupForMember({ groupId: input.groupId, userId: input.viewerUserId });
  if (!group) return null;

  const [members, blocked] = await Promise.all([
    listCrewMembers({
      groupId: input.groupId,
      viewerUserId: input.viewerUserId,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      now: input.rangeEnd,
    }),
    listBlockedUsersForMember(input.viewerUserId),
  ]);
  const blockedIds = new Set(blocked.map((row) => row.userId));
  const visibleMembers = members.filter((member) => !blockedIds.has(member.userId));
  const posts = await listVisibleWorkoutPostsInWeek(input);
  const sessionIds = posts.flatMap((post) => post.sessionId ? [post.sessionId] : []);
  const contributions = await loadSessionContributions(sessionIds);
  const totals = aggregatePeriodStats({
    period: "week",
    start: input.weekStart,
    end: input.rangeEnd,
    rangeLabel: "week",
    contributions,
  });

  const byUser = new Map<string, { workouts: number; days: Set<number> }>();
  const byWeekday = Array.from({ length: 7 }, () => new Set<string>());
  for (const post of posts) {
    const weekday = localWeekdayIndex(post.occurredAt, input.timeZone);
    byWeekday[weekday]?.add(post.userId);
    const current = byUser.get(post.userId) ?? { workouts: 0, days: new Set<number>() };
    current.workouts += 1;
    current.days.add(weekday);
    byUser.set(post.userId, current);
  }

  const todayIndex = input.todayStart
    ? localWeekdayIndex(input.todayStart, input.timeZone)
    : -1;
  const letters = weekdayLetters();

  return {
    memberCount: visibleMembers.length,
    activeMembers: byUser.size,
    sharedWorkouts: posts.length,
    recordedSeconds: totals.recordedSeconds,
    recordedMeters: totals.recordedMeters,
    days: letters.map((weekday, weekdayIndex) => ({
      weekday,
      weekdayIndex,
      activeMembers: byWeekday[weekdayIndex]?.size ?? 0,
      isToday: weekdayIndex === todayIndex,
      isFuture: todayIndex >= 0 && weekdayIndex > todayIndex,
    })),
    members: visibleMembers.map((member) => {
      const stats = byUser.get(member.userId);
      return {
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        isYou: member.userId === input.viewerUserId,
        isOwner: member.role === "owner",
        workouts: stats?.workouts ?? 0,
        days: stats?.days.size ?? 0,
      };
    }),
  };
}

export async function listCrewHighlightsForMember(input: {
  groupId: string;
  viewerUserId: string;
  weekStart: Date;
  weekEnd: Date;
  rangeEnd: Date;
  todayStart: Date | null;
  timeZone: string;
}): Promise<CommunityHighlights | null> {
  const group = await requireGroupForMember({ groupId: input.groupId, userId: input.viewerUserId });
  if (!group) return null;

  const posts = await listVisibleWorkoutPostsInWeek(input);
  const weeklyCounts = new Map<string, { userId: string; displayName: string; count: number; days: Set<number> }>();
  for (const post of posts) {
    const current = weeklyCounts.get(post.userId) ?? {
      userId: post.userId,
      displayName: post.displayName,
      count: 0,
      days: new Set<number>(),
    };
    current.count += 1;
    current.days.add(localWeekdayIndex(post.occurredAt, input.timeZone));
    weeklyCounts.set(post.userId, current);
  }

  const weekly = [...weeklyCounts.values()]
    .filter((row) => row.count >= HIGHLIGHT_WEEKLY_MIN)
    .sort((left, right) => right.count - left.count || left.displayName.localeCompare(right.displayName))
    .map((row) => ({ userId: row.userId, displayName: row.displayName, count: row.count }));

  const consistent = [...weeklyCounts.values()]
    .filter((row) => row.days.size >= HIGHLIGHT_CONSISTENT_DAYS)
    .sort((left, right) => right.days.size - left.days.size || left.displayName.localeCompare(right.displayName))
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      count: row.days.size,
    }));

  const todayPosts = input.todayStart
    ? posts.filter((post) => post.occurredAt >= input.todayStart! && post.occurredAt <= input.rangeEnd)
    : [];
  const firstToday = todayPosts[0] ?? null;

  const postIds = posts.map((post) => post.postId);
  const [sharedPrs, sharedGoals] = await Promise.all([
    listSharedBadges(postIds, "pr", input.viewerUserId),
    listSharedBadges(postIds, "goal", input.viewerUserId),
  ]);

  const cheered = [...posts]
    .filter((post) => post.reactionCount > 0)
    .sort((left, right) => (
      right.reactionCount - left.reactionCount
      || right.createdAt.getTime() - left.createdAt.getTime()
    ))[0] ?? null;

  return {
    firstToRepInToday: firstToday
      ? { userId: firstToday.userId, displayName: firstToday.displayName }
      : null,
    weekly,
    consistent,
    sharedPrs,
    sharedGoals,
    mostCheered: cheered && cheered.sessionId
      ? {
          userId: cheered.userId,
          displayName: cheered.displayName,
          postId: cheered.postId,
          sessionId: cheered.sessionId,
          title: cheered.title?.trim() || "workout",
          reactionCount: cheered.reactionCount,
        }
      : cheered
        ? {
            userId: cheered.userId,
            displayName: cheered.displayName,
            postId: cheered.postId,
            sessionId: null,
            title: cheered.title?.trim() || "workout",
            reactionCount: cheered.reactionCount,
          }
        : null,
  };
}

export async function listCrewActivityForMember(input: {
  groupId: string;
  viewerUserId: string;
  now: Date;
  before?: Date;
}): Promise<CommunityActivity | null> {
  const group = await requireGroupForMember({ groupId: input.groupId, userId: input.viewerUserId });
  if (!group) return null;

  const since = new Date(input.now.getTime() - CREW_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const before = input.before ?? input.now;
  const database = getDatabase();

  const reactions = await database
    .select({
      id: schema.communityPostReactions.id,
      createdAt: schema.communityPostReactions.createdAt,
      actorUserId: schema.communityPostReactions.userId,
      actorDisplayName: schema.users.displayName,
      reactionType: schema.communityPostReactions.reactionType,
      postId: schema.communityPosts.id,
      sessionId: schema.communityPosts.workoutSessionId,
      postTitle: sql<string>`coalesce(${schema.workoutSessions.name}, ${schema.communityPosts.kind})`,
    })
    .from(schema.communityPostReactions)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPostReactions.communityPostId, schema.communityPosts.id),
    )
    .innerJoin(schema.users, eq(schema.communityPostReactions.userId, schema.users.id))
    .leftJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      eq(schema.communityPosts.userId, input.viewerUserId),
      ne(schema.communityPostReactions.userId, input.viewerUserId),
      gte(schema.communityPostReactions.createdAt, since),
      lt(schema.communityPostReactions.createdAt, before),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
      communityReactionVisibleToSql(input.viewerUserId, schema.communityPostReactions.id),
    ))
    .orderBy(desc(schema.communityPostReactions.createdAt), desc(schema.communityPostReactions.id))
    .limit(CREW_ACTIVITY_LIMIT);

  const comments = await database
    .select({
      id: schema.communityPostComments.id,
      createdAt: schema.communityPostComments.createdAt,
      actorUserId: schema.communityPostComments.userId,
      actorDisplayName: schema.users.displayName,
      text: schema.communityPostComments.text,
      postId: schema.communityPosts.id,
      sessionId: schema.communityPosts.workoutSessionId,
      postTitle: sql<string>`coalesce(${schema.workoutSessions.name}, ${schema.communityPosts.kind})`,
    })
    .from(schema.communityPostComments)
    .innerJoin(
      schema.communityPosts,
      eq(schema.communityPostComments.communityPostId, schema.communityPosts.id),
    )
    .innerJoin(schema.users, eq(schema.communityPostComments.userId, schema.users.id))
    .leftJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      eq(schema.communityPosts.userId, input.viewerUserId),
      ne(schema.communityPostComments.userId, input.viewerUserId),
      gte(schema.communityPostComments.createdAt, since),
      lt(schema.communityPostComments.createdAt, before),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
      communityCommentVisibleToSql(input.viewerUserId, schema.communityPostComments.id),
    ))
    .orderBy(desc(schema.communityPostComments.createdAt), desc(schema.communityPostComments.id))
    .limit(CREW_ACTIVITY_LIMIT);

  const items = [
    ...reactions.map((row) => ({
      id: `reaction:${row.id}`,
      kind: "reaction" as const,
      createdAt: row.createdAt.toISOString(),
      actorUserId: row.actorUserId,
      actorDisplayName: row.actorDisplayName,
      reactionType: asReactionType(row.reactionType),
      postId: row.postId,
      sessionId: row.sessionId,
      postTitle: activityTitle(row.postTitle),
    })),
    ...comments.map((row) => ({
      id: `comment:${row.id}`,
      kind: "comment" as const,
      createdAt: row.createdAt.toISOString(),
      actorUserId: row.actorUserId,
      actorDisplayName: row.actorDisplayName,
      commentText: truncateCommentPreview(row.text),
      postId: row.postId,
      sessionId: row.sessionId,
      postTitle: activityTitle(row.postTitle),
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice(0, CREW_ACTIVITY_LIMIT);

  return { items };
}

export async function listVisibleReactionsForPost(input: {
  groupId: string;
  viewerUserId: string;
  postId?: string;
  workoutSessionId?: string;
}): Promise<CommunityWhoReacted | null> {
  const group = await requireGroupForMember({ groupId: input.groupId, userId: input.viewerUserId });
  if (!group) return null;
  if (!input.postId && !input.workoutSessionId) return null;

  const [post] = await getDatabase()
    .select({ id: schema.communityPosts.id })
    .from(schema.communityPosts)
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      input.postId
        ? eq(schema.communityPosts.id, input.postId)
        : eq(schema.communityPosts.workoutSessionId, input.workoutSessionId!),
      communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id),
    ))
    .limit(1);
  if (!post) return null;

  const rows = await getDatabase()
    .select({
      userId: schema.communityPostReactions.userId,
      displayName: schema.users.displayName,
      reactionType: schema.communityPostReactions.reactionType,
      createdAt: schema.communityPostReactions.createdAt,
    })
    .from(schema.communityPostReactions)
    .innerJoin(schema.users, eq(schema.communityPostReactions.userId, schema.users.id))
    .where(and(
      eq(schema.communityPostReactions.communityPostId, post.id),
      communityReactionVisibleToSql(input.viewerUserId, schema.communityPostReactions.id),
    ))
    .orderBy(
      asc(schema.communityPostReactions.reactionType),
      asc(schema.communityPostReactions.createdAt),
      asc(schema.communityPostReactions.id),
    );

  const grouped = new Map<CommunityReactionType, CommunityWhoReacted["groups"][number]["reactors"]>();
  for (const row of rows) {
    const type = asReactionType(row.reactionType);
    if (!type) continue;
    const list = grouped.get(type) ?? [];
    list.push({
      userId: row.userId,
      displayName: row.displayName,
      isYou: row.userId === input.viewerUserId,
      createdAt: row.createdAt.toISOString(),
    });
    grouped.set(type, list);
  }

  return {
    groups: (["fire", "strong", "clap"] as const)
      .filter((type) => grouped.get(type)?.length)
      .map((reactionType) => ({
        reactionType,
        reactors: grouped.get(reactionType) ?? [],
      })),
  };
}

export async function listLatestCommentsForPosts(input: {
  viewerUserId: string;
  postIds: string[];
}) {
  const comments = new Map<string, CommunityLatestComment>();
  if (!input.postIds.length) return comments;

  const rows = await getDatabase()
    .selectDistinctOn([schema.communityPostComments.communityPostId], {
      postId: schema.communityPostComments.communityPostId,
      displayName: schema.users.displayName,
      text: schema.communityPostComments.text,
      createdAt: schema.communityPostComments.createdAt,
    })
    .from(schema.communityPostComments)
    .innerJoin(schema.users, eq(schema.communityPostComments.userId, schema.users.id))
    .where(and(
      inArray(schema.communityPostComments.communityPostId, input.postIds),
      communityCommentVisibleToSql(input.viewerUserId, schema.communityPostComments.id),
    ))
    .orderBy(
      schema.communityPostComments.communityPostId,
      desc(schema.communityPostComments.createdAt),
      desc(schema.communityPostComments.id),
    );

  for (const row of rows) {
    comments.set(row.postId, {
      displayName: row.displayName,
      text: truncateCommentPreview(row.text),
      createdAt: row.createdAt.toISOString(),
    });
  }
  return comments;
}

export async function listViewerReactionsForPosts(input: {
  viewerUserId: string;
  postIds: string[];
}) {
  const reactions = new Map<string, CommunityReactionType>();
  if (!input.postIds.length) return reactions;
  const rows = await getDatabase()
    .select({
      postId: schema.communityPostReactions.communityPostId,
      reactionType: schema.communityPostReactions.reactionType,
    })
    .from(schema.communityPostReactions)
    .where(and(
      inArray(schema.communityPostReactions.communityPostId, input.postIds),
      eq(schema.communityPostReactions.userId, input.viewerUserId),
      communityReactionVisibleToSql(input.viewerUserId, schema.communityPostReactions.id),
    ));
  for (const row of rows) {
    const type = asReactionType(row.reactionType);
    if (type) reactions.set(row.postId, type);
  }
  return reactions;
}

function visibleTotalReactionCountSql(viewerId: string) {
  return sql<number>`(
    select count(*)::int
    from ${schema.communityPostReactions}
    where ${schema.communityPostReactions.communityPostId} = ${schema.communityPosts.id}
      and ${communityReactionVisibleToSql(viewerId, schema.communityPostReactions.id)}
  )`.mapWith(Number);
}

async function countActiveMembers(groupId: string) {
  const [row] = await getDatabase()
    .select({ value: count() })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), activeMembership));
  return row?.value ?? 0;
}

async function listSharedBadges(
  postIds: string[],
  kind: "pr" | "goal",
  viewerUserId: string,
) {
  if (!postIds.length) return [];
  if (kind === "pr") {
    const rows = await getDatabase()
      .select({
        userId: schema.communityPostPrs.userId,
        displayName: schema.users.displayName,
        label: schema.communityPostPrs.displayLabel,
        createdAt: schema.communityPostPrs.createdAt,
      })
      .from(schema.communityPostPrs)
      .innerJoin(schema.communityPosts, eq(schema.communityPostPrs.postId, schema.communityPosts.id))
      .innerJoin(schema.users, eq(schema.communityPostPrs.userId, schema.users.id))
      .where(and(
        inArray(schema.communityPostPrs.postId, postIds),
        communityPostVisibleToSql(viewerUserId, schema.communityPosts.id),
      ))
      .orderBy(desc(schema.communityPostPrs.createdAt))
      .limit(HIGHLIGHT_BADGE_LIMIT);
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      label: row.label,
    }));
  }

  const rows = await getDatabase()
    .select({
      userId: schema.communityPostGoals.userId,
      displayName: schema.users.displayName,
      label: schema.communityPostGoals.displayLabel,
      createdAt: schema.communityPostGoals.createdAt,
    })
    .from(schema.communityPostGoals)
    .innerJoin(schema.communityPosts, eq(schema.communityPostGoals.postId, schema.communityPosts.id))
    .innerJoin(schema.users, eq(schema.communityPostGoals.userId, schema.users.id))
    .where(and(
      inArray(schema.communityPostGoals.postId, postIds),
      communityPostVisibleToSql(viewerUserId, schema.communityPosts.id),
    ))
    .orderBy(desc(schema.communityPostGoals.createdAt))
    .limit(HIGHLIGHT_BADGE_LIMIT);
  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    label: row.label,
  }));
}

async function loadSessionContributions(sessionIds: string[]) {
  if (!sessionIds.length) return [];
  const database = getDatabase();
  const [sessions, metrics, segments] = await Promise.all([
    database
      .select({
        id: schema.workoutSessions.id,
        userId: schema.workoutSessions.userId,
        occurredAt: schema.workoutSessions.occurredAt,
        workoutType: schema.workoutSessions.workoutType,
        workoutFormat: schema.workoutSessions.workoutFormat,
        formatDurationSeconds: schema.workoutSessions.formatDurationSeconds,
        timeCapSeconds: schema.workoutSessions.timeCapSeconds,
        scoreFinished: schema.workoutSessions.scoreFinished,
        scoreTimeSeconds: schema.workoutSessions.scoreTimeSeconds,
        name: schema.workoutSessions.name,
        durationMinutes: schema.workoutSessions.durationMinutes,
      })
      .from(schema.workoutSessions)
      .where(inArray(schema.workoutSessions.id, sessionIds)),
    database
      .select({
        workoutSessionId: schema.workoutSessionMetrics.workoutSessionId,
        metricType: schema.workoutSessionMetrics.metricType,
        numericValue: schema.workoutSessionMetrics.numericValue,
        unit: schema.workoutSessionMetrics.unit,
      })
      .from(schema.workoutSessionMetrics)
      .where(inArray(schema.workoutSessionMetrics.workoutSessionId, sessionIds)),
    database
      .select({
        workoutSessionId: schema.workoutSessionSegments.workoutSessionId,
        segmentType: schema.workoutSessionSegments.segmentType,
        distance: schema.workoutSessionSegments.distance,
        distanceUnit: schema.workoutSessionSegments.distanceUnit,
        durationSeconds: schema.workoutSessionSegments.durationSeconds,
      })
      .from(schema.workoutSessionSegments)
      .where(inArray(schema.workoutSessionSegments.workoutSessionId, sessionIds)),
  ]);

  const metricsBySession = new Map<string, GoalSessionSnapshot["metrics"]>();
  for (const metric of metrics) {
    const list = metricsBySession.get(metric.workoutSessionId) ?? [];
    list.push({
      metricType: metric.metricType,
      numericValue: metric.numericValue,
      unit: metric.unit,
    });
    metricsBySession.set(metric.workoutSessionId, list);
  }
  const segmentsBySession = new Map<string, GoalSessionSnapshot["segments"]>();
  for (const segment of segments) {
    const list = segmentsBySession.get(segment.workoutSessionId) ?? [];
    list.push({
      segmentType: segment.segmentType,
      distance: segment.distance,
      distanceUnit: segment.distanceUnit,
      durationSeconds: segment.durationSeconds,
    });
    segmentsBySession.set(segment.workoutSessionId, list);
  }

  return sessions.map((session) => dashboardSessionContribution({
    id: session.id,
    userId: session.userId,
    occurredAt: session.occurredAt,
    workoutType: session.workoutType,
    workoutFormat: session.workoutFormat,
    formatDurationSeconds: session.formatDurationSeconds,
    timeCapSeconds: session.timeCapSeconds,
    scoreFinished: session.scoreFinished,
    scoreTimeSeconds: session.scoreTimeSeconds,
    name: session.name,
    durationMinutes: session.durationMinutes,
    createdAt: session.occurredAt,
    metrics: metricsBySession.get(session.id) ?? [],
    movements: [],
    segments: segmentsBySession.get(session.id) ?? [],
  }));
}

function asReactionType(value: string): CommunityReactionType | undefined {
  if (value === "fire" || value === "strong" || value === "clap") return value;
  return undefined;
}

function activityTitle(value: string | null) {
  if (!value || value === "workout" || value === "general") return value === "general" ? "post" : "workout";
  return value;
}
