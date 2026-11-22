import assert from "node:assert/strict";
import { test } from "node:test";

import type { CommunityData, CommunityFeedItem, GeneralPostFeedItem, WorkoutFeedItem } from "@repin/types";

import {
  communityFeedItemMatchesId,
  communityFeedNearEnd,
  dedupeCommunityFeed,
  reduceCommunityFeed,
  workoutsFromCommunityFeed,
} from "./community-feed-state";

/* eslint-disable @typescript-eslint/no-floating-promises */

const group = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "crew-1",
  name: "Morning Crew",
  ownerId: "user-ada",
  role: "owner" as const,
};

function workout(id: string, extra: Partial<WorkoutFeedItem> = {}): WorkoutFeedItem {
  return {
    caption: null,
    commentCount: 0,
    createdAt: "2026-11-20T12:00:00.000Z",
    displayName: "Ada",
    durationMinutes: 30,
    effort: 3,
    groupId: "crew-1",
    id,
    kind: "workout",
    name: "Easy run",
    notes: null,
    occurredAt: "2026-11-20T12:00:00.000Z",
    photoPath: null,
    reactionCounts: { clap: 0, fire: 0, strong: 0 },
    title: "Easy run",
    updatedAt: "2026-11-20T12:00:00.000Z",
    userId: "user-ada",
    workoutType: "run",
    ...extra,
  };
}

function general(id: string, extra: Partial<GeneralPostFeedItem> = {}): GeneralPostFeedItem {
  return {
    body: "Hello crew",
    commentCount: 0,
    createdAt: "2026-11-20T13:00:00.000Z",
    displayName: "Maya",
    editedAt: null,
    groupId: "crew-1",
    id,
    kind: "general",
    links: [],
    photos: [],
    publicationId: `pub-${id}`,
    reactionCounts: { clap: 0, fire: 0, strong: 0 },
    updatedAt: "2026-11-20T13:00:00.000Z",
    userId: "user-maya",
    ...extra,
  };
}

function board(feed: CommunityFeedItem[], extra: Partial<CommunityData> = {}): CommunityData {
  return {
    communityFeed: feed,
    communityWorkouts: [],
    groups: [group],
    nextCursor: "cursor-1",
    pinnedPost: null,
    selectedGroupId: "crew-1",
    ...extra,
  };
}

test("in-place updates map communityFeed, including general posts and pin", () => {
  const pinned = general("pin-1", { commentCount: 1 });
  const state = board([workout("w1"), general("g1")], { pinnedPost: pinned });
  const reacted = reduceCommunityFeed(state, {
    type: "updateReaction",
    id: "w1",
    counts: { clap: 1, fire: 2, strong: 0 },
  });
  const reactedWithViewer = reduceCommunityFeed(state, {
    type: "updateReaction",
    id: "w1",
    counts: { clap: 1, fire: 2, strong: 0 },
    viewerReaction: "fire",
  });
  assert.equal(reactedWithViewer?.communityFeed?.[0]?.reactionCounts?.fire, 2);
  assert.equal(reactedWithViewer?.communityFeed?.[0]?.viewerReaction, "fire");
  assert.equal(reacted?.communityFeed?.[0]?.reactionCounts?.fire, 2);
  assert.equal(reacted?.communityWorkouts.length, 0);

  const counted = reduceCommunityFeed(reacted, { type: "updateCommentCount", id: "g1", commentCount: 4 });
  assert.equal(counted?.communityFeed?.find((item) => item.id === "g1")?.commentCount, 4);

  const pinnedCount = reduceCommunityFeed(counted, { type: "updateCommentCount", id: "pin-1", commentCount: 9 });
  assert.equal(pinnedCount?.pinnedPost?.commentCount, 9);

  const badges = reduceCommunityFeed(pinnedCount, {
    type: "updatePrBadges",
    id: "w1",
    prBadges: [{ id: "pr-1", kind: "distance_time", key: "5k", label: "5K", value: "22:10" }],
  });
  const updatedWorkout = badges?.communityFeed?.find((item) => item.id === "w1");
  assert.equal(updatedWorkout && updatedWorkout.kind !== "general" && updatedWorkout.prBadges?.length, 1);

  const undone = reduceCommunityFeed(badges, { type: "updatePrBadges", id: "w1", prBadges: [] });
  const undoneWorkout = undone?.communityFeed?.find((item) => item.id === "w1");
  assert.equal(undoneWorkout && undoneWorkout.kind !== "general" && undoneWorkout.prBadges?.length, 0);
});

test("hides remove posts from the feed immediately, including after Report and Block", () => {
  const pinned = general("pin-1", { userId: "user-maya" });
  const state = board(
    [
      workout("w1", { userId: "user-ada", communityPostId: "post-w1" }),
      general("g1", { userId: "user-maya" }),
      workout("w2", { userId: "user-maya" }),
    ],
    { pinnedPost: pinned },
  );

  const afterReport = reduceCommunityFeed(state, {
    type: "hide",
    matches: (item) => communityFeedItemMatchesId(item, "g1"),
  });
  assert.equal(afterReport?.communityFeed?.some((item) => item.id === "g1"), false);
  assert.equal(afterReport?.communityFeed?.length, 2);
  assert.equal(afterReport?.pinnedPost?.id, "pin-1");

  const afterBlock = reduceCommunityFeed(afterReport, {
    type: "hide",
    matches: (item) => item.userId === "user-maya",
  });
  assert.equal(afterBlock?.communityFeed?.every((item) => item.userId !== "user-maya"), true);
  assert.equal(afterBlock?.pinnedPost, null);
  assert.equal(afterBlock?.communityFeed?.map((item) => item.id).join(","), "w1");

  const afterWorkoutReport = reduceCommunityFeed(state, {
    type: "hide",
    matches: (item) => communityFeedItemMatchesId(item, "post-w1"),
  });
  assert.equal(afterWorkoutReport?.communityFeed?.some((item) => item.id === "w1"), false);
});

test("crew reset clears the feed, pin, and cursor and keeps the next crew id", () => {
  const state = board([workout("w1"), general("g1")], {
    nextCursor: "keep-me",
    pinnedPost: general("pin-1"),
    selectedGroupId: "crew-1",
  });
  const reset = reduceCommunityFeed(state, { type: "reset", selectedGroupId: "crew-2" });
  assert.deepEqual(reset?.communityFeed, []);
  assert.deepEqual(reset?.communityWorkouts, []);
  assert.equal(reset?.pinnedPost, null);
  assert.equal(reset?.nextCursor, null);
  assert.equal(reset?.selectedGroupId, "crew-2");
  assert.equal(reset?.groups[0]?.id, "crew-1");
});

test("append dedupes by id and never repeats the pinned post", () => {
  const pinned = general("pin-1");
  const first = reduceCommunityFeed(null, {
    type: "replace",
    data: board([workout("w1"), general("g1")], { pinnedPost: pinned, nextCursor: "page-2" }),
  });
  const appended = reduceCommunityFeed(first, {
    type: "append",
    items: [workout("w1"), general("pin-1"), workout("w2")],
    nextCursor: null,
  });
  assert.deepEqual(appended?.communityFeed?.map((item) => item.id), ["w1", "g1", "w2"]);
  assert.equal(appended?.nextCursor, null);
  assert.equal(appended?.pinnedPost?.id, "pin-1");
});

test("replace drops duplicate ids and the pinned row from the page", () => {
  const pinned = general("pin-1");
  const replaced = reduceCommunityFeed(null, {
    type: "replace",
    data: board([general("pin-1"), workout("w1"), workout("w1")], { pinnedPost: pinned }),
  });
  assert.deepEqual(replaced?.communityFeed?.map((item) => item.id), ["w1"]);
});

test("workoutsFromCommunityFeed skips general posts", () => {
  const items = [general("g1"), workout("w1"), workout("w2")];
  assert.deepEqual(workoutsFromCommunityFeed(items).map((item) => item.id), ["w1", "w2"]);
});

test("dedupeCommunityFeed keeps first occurrence and skips the pin", () => {
  const items = [workout("w1"), workout("w2"), workout("w1")];
  assert.deepEqual(dedupeCommunityFeed(items, "w2").map((item) => item.id), ["w1"]);
});

test("near-end detection uses the remaining content height", () => {
  assert.equal(communityFeedNearEnd({
    contentOffset: { y: 900 },
    contentSize: { height: 1000 },
    layoutMeasurement: { height: 100 },
  }, 50), true);
  assert.equal(communityFeedNearEnd({
    contentOffset: { y: 100 },
    contentSize: { height: 1000 },
    layoutMeasurement: { height: 100 },
  }, 50), false);
});
