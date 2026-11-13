import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { defaultCrewNotificationPrefs } from "./crew";
import {
  commentPushBody,
  crewPushBody,
  crewPushHref,
  crewPushTitle,
  isPushRecipientEligible,
  newWorkoutPushBody,
  parseCrewPushPayload,
  pushCopy,
  reactionPushBody,
  registerPushTokenSchema,
  shouldSendReactionPush,
  unregisterPushTokenSchema,
} from "./push";

const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const member = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const groupId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const postId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const visibleAfter = new Date("2026-01-01T00:00:00.000Z");
const createdAt = new Date("2026-11-06T12:00:00.000Z");

test("pre-prompt copy is Quill's draft and lives in one constants file", () => {
  assert.equal(pushCopy.prePrompt.title, "Stay in the loop with your crew");
  assert.equal(
    pushCopy.prePrompt.body,
    "Get a heads-up when your crew posts a workout, or when someone comments on or reacts to yours. You can adjust this for each crew anytime in Notifications.",
  );
  assert.equal(pushCopy.prePrompt.primary, "Turn on notifications");
  assert.equal(pushCopy.prePrompt.secondary, "Not now");
});

test("push bodies have no emoji, no app name, and never say 1 people", () => {
  const bodies = [
    newWorkoutPushBody("Maya", "Sunrise"),
    commentPushBody("Sam"),
    reactionPushBody("Alex", 1),
    reactionPushBody("Alex", 2),
    reactionPushBody("Alex", 0),
    crewPushBody({ type: "crew_workout", actorName: "Maya", crewName: "Sunrise" }),
    crewPushBody({ type: "crew_comment", actorName: "Sam", crewName: "Sunrise" }),
    crewPushBody({
      type: "crew_reaction",
      actorName: "Alex",
      crewName: "Sunrise",
      reactionCount: 1,
    }),
    crewPushBody({
      type: "crew_reaction",
      actorName: "Alex",
      crewName: "Sunrise",
      reactionCount: 3,
    }),
    crewPushBody({
      type: "crew_post",
      actorName: "Maya T.",
      crewName: "Morning Crew",
      firstLine: "Thursday track at 6 AM",
    }),
  ];

  assert.equal(bodies[0], "Maya posted a workout in Sunrise. Go cheer them on.");
  assert.equal(bodies[1], "Sam commented on your workout.");
  assert.equal(bodies[2], "Alex reacted to your workout.");
  assert.equal(bodies[3], "2 people reacted to your workout.");
  assert.equal(bodies[4], "Alex reacted to your workout.");
  assert.equal(bodies[7], "Alex reacted to your workout.");
  assert.equal(bodies[8], "3 people reacted to your workout.");
  assert.equal(bodies[9], "Thursday track at 6 AM");
  assert.equal(
    crewPushTitle({ type: "crew_post", actorName: "Maya T.", crewName: "Morning Crew" }),
    "Maya T. posted in Morning Crew",
  );

  for (const body of bodies) {
    assert.doesNotMatch(body, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(body, /repin/i);
    assert.doesNotMatch(body, /1 people/);
  }
});

test("recipient selection drops self, muted, left, removed, closed, and hidden content", () => {
  const allowed = {
    actorUserId: actor,
    recipientUserId: member,
    recipientLeftAt: null,
    crewClosedAt: null,
    contentCreatedAt: createdAt,
    recipientContentVisibleAfter: visibleAfter,
    prefs: defaultCrewNotificationPrefs,
    alertType: "crew_workout" as const,
  };

  assert.equal(isPushRecipientEligible(allowed), true);
  assert.equal(
    isPushRecipientEligible({ ...allowed, recipientUserId: actor }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      prefs: { ...defaultCrewNotificationPrefs, muteAll: true },
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      prefs: { ...defaultCrewNotificationPrefs, crewWorkout: false },
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      alertType: "crew_comment",
      prefs: { ...defaultCrewNotificationPrefs, crewComment: false },
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      alertType: "crew_post",
      prefs: defaultCrewNotificationPrefs,
    }),
    true,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      alertType: "crew_post",
      prefs: { ...defaultCrewNotificationPrefs, crewPost: false },
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      recipientLeftAt: new Date("2026-11-01T00:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      crewClosedAt: new Date("2026-11-01T00:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isPushRecipientEligible({
      ...allowed,
      recipientContentVisibleAfter: new Date("2026-11-07T00:00:00.000Z"),
    }),
    false,
  );
});

test("reaction batching sends when never sent or the window has passed", () => {
  const now = new Date("2026-11-06T12:05:00.000Z");
  assert.equal(shouldSendReactionPush(null, now), true);
  assert.equal(
    shouldSendReactionPush(new Date("2026-11-06T12:00:00.000Z"), now),
    true,
  );
  assert.equal(
    shouldSendReactionPush(new Date("2026-11-06T12:00:01.000Z"), now),
    false,
  );
  assert.equal(
    shouldSendReactionPush(new Date("2026-11-06T12:04:59.000Z"), now),
    false,
  );
});

test("payload routing opens the workout and falls back to the crew when the post is gone", () => {
  const payload = {
    type: "crew_comment" as const,
    groupId,
    sessionId,
    postId,
  };
  assert.deepEqual(parseCrewPushPayload(payload), payload);
  assert.equal(
    crewPushHref(payload),
    `/workouts/${sessionId}?groupId=${groupId}&fromPush=1`,
  );
  assert.equal(crewPushHref(payload, true), `/groups/${groupId}`);
  assert.equal(parseCrewPushPayload({ type: "crew_workout" }), null);
  assert.equal(parseCrewPushPayload({ ...payload, type: "marketing" }), null);
  assert.equal(
    crewPushHref({ ...payload, type: "crew_workout" }).includes(sessionId),
    true,
  );
  assert.equal(
    crewPushHref({ ...payload, type: "crew_reaction" }, true).startsWith("/groups/"),
    true,
  );
  const postPayload = {
    type: "crew_post" as const,
    groupId,
    postId,
  };
  assert.deepEqual(parseCrewPushPayload(postPayload), postPayload);
  assert.deepEqual(parseCrewPushPayload({ ...postPayload, sessionId }), postPayload);
  assert.equal(
    crewPushHref(postPayload).includes(`post=${postId}`),
    true,
  );
  assert.equal(
    crewPushHref(postPayload).includes("sessionId"),
    false,
  );
});

test("push token payloads require an Expo token and a platform", () => {
  const token = "ExponentPushToken[abc123]";
  assert.equal(
    registerPushTokenSchema.safeParse({ expoPushToken: token, platform: "ios" }).success,
    true,
  );
  assert.equal(
    registerPushTokenSchema.safeParse({
      expoPushToken: token,
      platform: "ios",
      supportsPostTargets: true,
    }).success,
    true,
  );
  assert.equal(
    registerPushTokenSchema.safeParse({ expoPushToken: "not-a-token", platform: "ios" }).success,
    false,
  );
  assert.equal(
    unregisterPushTokenSchema.safeParse({ expoPushToken: token }).success,
    true,
  );
});
