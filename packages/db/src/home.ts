import "server-only";

import type { HomeCrewHighlights } from "@repin/types";
import {
  addZonedDays,
  countWeeklyStreak,
  currentWeekStartKey,
  formatZonedYmd,
  sundayWeekBounds,
} from "@repin/validation";
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getDatabase } from "./connection";
import * as schema from "./schema";
import { communityPostVisibleToSql } from "./visibility";

export async function getUserWeeklyStreak(input: {
  userId: string;
  timeZone: string;
  now: Date;
}) {
  const week = sundayWeekBounds(input.now, input.timeZone);
  const lookback = addZonedDays(week.weekStart, -52 * 7, input.timeZone);
  const rows = await getDatabase()
    .select({ occurredAt: schema.workoutSessions.occurredAt })
    .from(schema.workoutSessions)
    .where(and(
      eq(schema.workoutSessions.userId, input.userId),
      gte(schema.workoutSessions.occurredAt, lookback),
      lte(schema.workoutSessions.occurredAt, input.now),
    ));
  const keys = [...new Set(
    rows
      .filter((row) => row.occurredAt)
      .map((row) => formatZonedYmd(
        sundayWeekBounds(row.occurredAt, input.timeZone).weekStart,
        input.timeZone,
      )),
  )];
  return {
    weeks: countWeeklyStreak(keys, currentWeekStartKey(input.now, input.timeZone)),
  };
}

export async function listCrewHighlightsForHome(input: {
  groupId: string;
  viewerUserId: string;
  todayStart: Date;
  weekStart: Date;
  now: Date;
}): Promise<HomeCrewHighlights> {
  const database = getDatabase();
  const visible = communityPostVisibleToSql(input.viewerUserId, schema.communityPosts.id);
  const weekly = await database
    .select({
      userId: schema.communityPosts.userId,
      displayName: schema.users.displayName,
      value: count(),
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .innerJoin(schema.users, eq(schema.communityPosts.userId, schema.users.id))
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      visible,
      gte(schema.workoutSessions.occurredAt, input.weekStart),
      lte(schema.workoutSessions.occurredAt, input.now),
      sql`${schema.communityPosts.workoutSessionId} is not null`,
    ))
    .groupBy(schema.communityPosts.userId, schema.users.displayName)
    .orderBy(desc(count()), asc(schema.users.displayName));

  const [first] = await database
    .select({
      userId: schema.communityPosts.userId,
      displayName: schema.users.displayName,
    })
    .from(schema.communityPosts)
    .innerJoin(
      schema.workoutSessions,
      eq(schema.communityPosts.workoutSessionId, schema.workoutSessions.id),
    )
    .innerJoin(schema.users, eq(schema.communityPosts.userId, schema.users.id))
    .where(and(
      eq(schema.communityPosts.groupId, input.groupId),
      visible,
      gte(schema.workoutSessions.occurredAt, input.todayStart),
      lte(schema.workoutSessions.occurredAt, input.now),
      sql`${schema.communityPosts.workoutSessionId} is not null`,
    ))
    .orderBy(asc(schema.workoutSessions.occurredAt), asc(schema.communityPosts.createdAt))
    .limit(1);

  return {
    firstToRepInToday: first ?? null,
    weekly: weekly
      .filter((row) => row.value >= 2)
      .slice(0, 3)
      .map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        count: row.value,
      })),
  };
}
