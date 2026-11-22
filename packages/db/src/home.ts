import "server-only";

import type { HomeCrewHighlights } from "@repin/types";
import {
  addZonedDays,
  countWeeklyStreak,
  currentWeekStartKey,
  formatZonedYmd,
  homeHighlightsFromCrew,
  sundayWeekBounds,
} from "@repin/validation";
import { and, lte, eq, gte } from "drizzle-orm";

import { listCrewHighlightsForMember } from "./community-revamp";
import { getDatabase } from "./connection";
import * as schema from "./schema";

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
  weekEnd: Date;
  now: Date;
  timeZone: string;
}): Promise<HomeCrewHighlights> {
  const highlights = await listCrewHighlightsForMember({
    groupId: input.groupId,
    viewerUserId: input.viewerUserId,
    todayStart: input.todayStart,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    rangeEnd: input.now,
    timeZone: input.timeZone,
  });
  return homeHighlightsFromCrew(highlights ?? {
    firstToRepInToday: null,
    weekly: [],
    consistent: [],
    sharedPrs: [],
    sharedGoals: [],
    mostCheered: null,
  });
}
