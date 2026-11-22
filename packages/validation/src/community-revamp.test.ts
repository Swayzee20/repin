import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HIGHLIGHT_WEEKLY_MIN,
  REACTION_EMOJI_SIZE,
  REACTION_HIT,
  REACTION_PILL_HEIGHT,
  REACTION_PILL_ONE_DIGIT_WIDTH,
  REACTION_PILL_TWO_DIGIT_WIDTH,
  REACTION_PILL_ZERO_WIDTH,
  REACTION_VERTICAL_HITSLOP,
  activityItemLine,
  communityHighlightRows,
  communityRevampCopy,
  crewWeekWindow,
  emptyReactionSummary,
  groupActivityItems,
  groupWhoReacted,
  formatEntryCount,
  highlightCountOf,
  highlightsEntryLabel,
  activityEntryLabel,
  homeHighlightsFromCrew,
  optimisticReactionSummary,
  reactionAccessibilityLabel,
  reactionPillHitSlop,
  reactionPillWidth,
} from "./community-revamp";

/* eslint-disable @typescript-eslint/no-floating-promises */

const emptyHighlights = {
  firstToRepInToday: null,
  weekly: [],
  consistent: [],
  sharedPrs: [],
  sharedGoals: [],
  mostCheered: null,
};

test("reaction pills match the compact 32/16 recipe and 44 pt hit via hitSlop", () => {
  assert.equal(REACTION_PILL_HEIGHT, 32);
  assert.equal(REACTION_EMOJI_SIZE, 16);
  assert.equal(REACTION_HIT, 44);
  assert.equal(REACTION_VERTICAL_HITSLOP, 6);
  assert.equal(reactionPillWidth(0), REACTION_PILL_ZERO_WIDTH);
  assert.equal(reactionPillWidth(3), REACTION_PILL_ONE_DIGIT_WIDTH);
  assert.equal(reactionPillWidth(10), REACTION_PILL_TWO_DIGIT_WIDTH);
  assert.deepEqual(reactionPillHitSlop(0), { top: 6, bottom: 6, left: 4, right: 4 });
  assert.deepEqual(reactionPillHitSlop(3), { top: 6, bottom: 6, left: 0, right: 0 });
  assert.equal(reactionAccessibilityLabel("fire", 3, true), "Fire, 3 reactions, selected");
  assert.equal(reactionAccessibilityLabel("fire", 1, false), "Fire, 1 reaction");
});

test("optimistic reactions toggle, switch, and roll back by replaying the previous summary", () => {
  const start = emptyReactionSummary();
  const fired = optimisticReactionSummary(start, "fire");
  assert.deepEqual(fired, { counts: { clap: 0, fire: 1, strong: 0 }, total: 1, viewerReaction: "fire" });
  const switched = optimisticReactionSummary(fired, "clap");
  assert.equal(switched.viewerReaction, "clap");
  assert.equal(switched.counts.fire, 0);
  assert.equal(switched.counts.clap, 1);
  const cleared = optimisticReactionSummary(switched, "clap");
  assert.equal(cleared.viewerReaction, null);
  assert.equal(cleared.counts.clap, 0);
  const restored = optimisticReactionSummary(start, "fire");
  assert.deepEqual(restored, fired);
});

test("Home and Community Highlights share Sun-Sat workout threshold and hide crew-of-one extras", () => {
  assert.equal(HIGHLIGHT_WEEKLY_MIN, 2);
  const chicago = crewWeekWindow(new Date("2026-11-18T21:41:00.000Z"), "America/Chicago");
  assert.equal(chicago.weekStart.toISOString().startsWith("2026-11-15"), true);
  const highlights = {
    firstToRepInToday: { userId: "maya", displayName: "Maya" },
    weekly: [
      { userId: "sam", displayName: "Sam", count: 3 },
      { userId: "kai", displayName: "Kai", count: 1 },
    ],
    consistent: [{ userId: "sam", displayName: "Sam", count: 4 }],
    sharedPrs: [{ userId: "maya", displayName: "Maya", label: "5K" }],
    sharedGoals: [],
    mostCheered: {
      userId: "maya",
      displayName: "Maya",
      postId: "p1",
      sessionId: "s1",
      title: "Morning run",
      reactionCount: 4,
    },
  };
  const home = homeHighlightsFromCrew(highlights);
  assert.equal(home.weekly.length, 1);
  assert.equal(home.weekly[0]?.count, 3);
  assert.equal(communityHighlightRows(highlights, { crewSize: 1, week: "current" }).some((row) => row.kind === "consistent"), false);
  assert.equal(communityHighlightRows(highlights, { crewSize: 1, week: "current" }).some((row) => row.kind === "cheered"), false);
  assert.equal(communityHighlightRows(highlights, { crewSize: 6, week: "current" }).some((row) => row.kind === "consistent"), true);
  assert.equal(highlightCountOf(emptyHighlights, 6), 0);
  assert.equal(communityRevampCopy.seeAll, "See all");
  assert.equal(communityRevampCopy.activity, "Activity");
  assert.equal(highlightsEntryLabel(0), "Highlights, 0");
  assert.equal(activityEntryLabel(2), "Activity on your posts, 2");
  assert.equal(formatEntryCount(4), "4");
  assert.equal(formatEntryCount(999), "999");
  assert.equal(formatEntryCount(1000), "1k");
  assert.equal(formatEntryCount(1200), "1.2k");
});

test("activity grouping is today vs earlier and who-reacted stays grouped by type", () => {
  const now = new Date("2026-11-18T21:41:00.000Z");
  const items = [
    {
      id: "a",
      kind: "reaction" as const,
      createdAt: "2026-11-18T16:00:00.000Z",
      actorUserId: "alex",
      actorDisplayName: "Alex",
      reactionType: "fire" as const,
      postId: "p1",
      sessionId: "s1",
      postTitle: "5K",
    },
    {
      id: "b",
      kind: "comment" as const,
      createdAt: "2026-11-17T16:00:00.000Z",
      actorUserId: "riley",
      actorDisplayName: "Riley",
      commentText: "Nice work",
      postId: "p1",
      sessionId: "s1",
      postTitle: "5K",
    },
  ];
  const grouped = groupActivityItems(items, now, "UTC");
  assert.equal(grouped.fresh.length, 1);
  assert.equal(grouped.earlier.length, 1);
  assert.match(activityItemLine(items[0]!, now), /Alex cheered your 5K/);
  const who = groupWhoReacted({
    groups: [
      {
        reactionType: "fire",
        reactors: [{ userId: "a", displayName: "Ada", isYou: true, createdAt: now.toISOString() }],
      },
      {
        reactionType: "clap",
        reactors: [{ userId: "b", displayName: "Byron", isYou: false, createdAt: now.toISOString() }],
      },
    ],
  }, "clap");
  assert.equal(who[0]?.reactionType, "clap");
  assert.equal(who[1]?.reactionType, "fire");
  assert.equal(who.some((group) => group.reactionType === "strong"), false);
});
