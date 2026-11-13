import assert from "node:assert/strict";
import { test } from "node:test";

import type { GeneralPostFeedItem, WorkoutFeedItem } from "@repin/types";

import {
  buildCommunityBoardRows,
  communityDayKey,
  communityItemCreatedAt,
  formatCommunityBoardDayA11y,
  formatCommunityBoardDayLabel,
  formatCommunityBoardTime,
  formatCommunityPinnedTimestamp,
} from "./community-feed-days";

/* eslint-disable @typescript-eslint/no-floating-promises */

const chicago = "America/Chicago";
const now = new Date("2026-11-13T18:00:00.000Z"); // Fri Nov 13, 12:00 PM CST

function general(id: string, createdAt: string, editedAt: string | null = null): GeneralPostFeedItem {
  return {
    body: "Hello",
    commentCount: 0,
    createdAt,
    displayName: "Maya L.",
    editedAt,
    groupId: "crew-1",
    id,
    kind: "general",
    links: [],
    photos: [],
    publicationId: `pub-${id}`,
    updatedAt: createdAt,
    userId: "user-maya",
  };
}

function workout(id: string, createdAt: string, occurredAt: string): WorkoutFeedItem {
  return {
    caption: null,
    createdAt,
    displayName: "Jordan P.",
    durationMinutes: null,
    effort: 3,
    groupId: "crew-1",
    id,
    kind: "workout",
    name: "Easy run",
    notes: null,
    occurredAt,
    photoPath: null,
    title: "Easy run",
    updatedAt: createdAt,
    userId: "user-jordan",
    workoutType: "run",
  };
}

test("today, yesterday, current-year, and prior-year day labels", () => {
  const today = new Date("2026-11-13T18:30:00.000Z");
  const yesterday = new Date("2026-11-13T05:40:00.000Z"); // Thu Nov 12, 11:40 PM CST
  const thisYear = new Date("2026-11-11T18:00:00.000Z");
  const priorYear = new Date("2025-11-11T18:00:00.000Z");

  assert.equal(formatCommunityBoardDayLabel(today, now, chicago), "Today");
  assert.equal(formatCommunityBoardDayLabel(yesterday, now, chicago), "Yesterday");
  assert.equal(formatCommunityBoardDayLabel(thisYear, now, chicago), "Wed, Nov 11");
  assert.equal(formatCommunityBoardDayLabel(priorYear, now, chicago), "Tue, Nov 11, 2025");

  assert.equal(formatCommunityBoardDayA11y(today, now, chicago), "Today");
  assert.equal(formatCommunityBoardDayA11y(yesterday, now, chicago), "Yesterday");
  assert.equal(formatCommunityBoardDayA11y(thisYear, now, chicago), "Wednesday, November 11");
  assert.equal(formatCommunityBoardDayA11y(priorYear, now, chicago), "Tuesday, November 11, 2025");
});

test("a 11:40 PM Chicago post stays on its calendar day across DST and midnight", () => {
  // Nov 12 2026 05:40 UTC = Nov 11 2026 11:40 PM CST (UTC-6, after DST ended Nov 1).
  const late = new Date("2026-11-12T05:40:00.000Z");
  assert.equal(communityDayKey(late, chicago), "2026-11-11");
  assert.equal(formatCommunityBoardDayLabel(late, now, chicago), "Wed, Nov 11");
  assert.equal(formatCommunityBoardTime(late, chicago), "11:40 PM");

  // 06:00 UTC is midnight Nov 12 in Chicago.
  const midnight = new Date("2026-11-12T06:00:00.000Z");
  assert.equal(communityDayKey(midnight, chicago), "2026-11-12");
  assert.equal(formatCommunityBoardDayLabel(midnight, now, chicago), "Yesterday");
  assert.equal(formatCommunityBoardTime(midnight, chicago), "12:00 AM");

  // Spring-forward 2026-03-08: 07:40 UTC is 1:40 AM CST, still March 8.
  const beforeSpring = new Date("2026-03-08T07:40:00.000Z");
  assert.equal(communityDayKey(beforeSpring, chicago), "2026-03-08");
  assert.equal(formatCommunityBoardTime(beforeSpring, chicago), "1:40 AM");

  // 08:40 UTC is 3:40 AM CDT after the gap.
  const afterSpring = new Date("2026-03-08T08:40:00.000Z");
  assert.equal(communityDayKey(afterSpring, chicago), "2026-03-08");
  assert.equal(formatCommunityBoardTime(afterSpring, chicago), "3:40 AM");
});

test("cards under a day header are time-only; pinned keeps a full date stamp", () => {
  const created = new Date("2026-11-12T13:40:00.000Z"); // Thu Nov 12, 7:40 AM CST
  assert.equal(formatCommunityBoardTime(created, chicago), "7:40 AM");
  assert.equal(formatCommunityBoardTime(created, chicago, "2026-11-12T14:00:00.000Z"), "7:40 AM · Edited");
  assert.equal(formatCommunityPinnedTimestamp(created, chicago), "Thu, Nov 12, 7:40 AM");
  assert.equal(
    formatCommunityPinnedTimestamp(created, chicago, "2026-11-12T14:00:00.000Z"),
    "Thu, Nov 12, 7:40 AM · Edited",
  );
});

test("empty days are skipped, a single post still gets a header, and pinned is excluded from its day", () => {
  const todayPost = general("g-today", "2026-11-13T16:12:00.000Z");
  const pinned = general("g-pin", "2026-11-12T13:40:00.000Z");
  const yesterdayOther = general("g-yest", "2026-11-12T18:00:00.000Z");
  const older = workout("w-old", "2026-11-11T18:00:00.000Z", "2026-11-10T12:00:00.000Z");

  const rows = buildCommunityBoardRows({
    items: [todayPost, pinned, yesterdayOther, older],
    now,
    pinnedPostId: pinned.id,
    timeZone: chicago,
  });

  const days = rows.filter((row) => row.type === "day");
  const posts = rows.filter((row) => row.type === "post");
  assert.deepEqual(days.map((row) => row.label), ["Today", "Yesterday", "Wed, Nov 11"]);
  assert.deepEqual(days.map((row) => row.accessibilityLabel), [
    "Today",
    "Yesterday",
    "Wednesday, November 11",
  ]);
  assert.equal(posts.some((row) => row.item.id === pinned.id), false);
  assert.equal(posts.length, 3);

  const onlyPinnedThatDay = buildCommunityBoardRows({
    items: [todayPost, pinned],
    now,
    pinnedPostId: pinned.id,
    timeZone: chicago,
  });
  assert.deepEqual(
    onlyPinnedThatDay.filter((row) => row.type === "day").map((row) => row.label),
    ["Today"],
  );
  assert.equal(onlyPinnedThatDay.filter((row) => row.type === "post").length, 1);

  const onePost = buildCommunityBoardRows({
    items: [todayPost],
    now,
    pinnedPostId: null,
    timeZone: chicago,
  });
  assert.equal(onePost.length, 2);
  assert.equal(onePost[0]?.type, "day");
  assert.equal(onePost[0] && onePost[0].type === "day" ? onePost[0].label : null, "Today");
});

test("grouping uses createdAt in the device zone, never the workout logged date", () => {
  const loggedYesterdayCreatedToday = workout(
    "w-split",
    "2026-11-13T16:00:00.000Z",
    "2026-11-12T16:00:00.000Z",
  );
  assert.equal(communityItemCreatedAt(loggedYesterdayCreatedToday)?.toISOString(), "2026-11-13T16:00:00.000Z");
  const rows = buildCommunityBoardRows({
    items: [loggedYesterdayCreatedToday],
    now,
    timeZone: chicago,
  });
  assert.equal(rows[0]?.type, "day");
  assert.equal(rows[0] && rows[0].type === "day" ? rows[0].label : null, "Today");
  assert.equal(rows[1] && rows[1].type === "post" ? rows[1].timestamp : null, "10:00 AM");
});

test("keys stay stable for header and post rows", () => {
  const item = general("g1", "2026-11-13T16:12:00.000Z");
  const rows = buildCommunityBoardRows({ items: [item], now, timeZone: chicago });
  assert.equal(rows[0] && rows[0].type === "day" ? rows[0].key : null, "day:2026-11-13");
  assert.equal(rows[1] && rows[1].type === "post" ? rows[1].key : null, "post:general:g1");
});
