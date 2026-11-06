import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  crewAlertAllowed,
  crewCopy,
  crewMarkTiles,
  crewPagePermissions,
  defaultCrewNotificationPrefs,
  firstNameForToast,
  formatWorkoutsThisWeek,
  isCrewPhotoPathForGroup,
  isInMondayWeek,
  mondayWeekBounds,
  notificationSummary,
  resolveCrewNotificationPrefs,
} from "./index";

const utc = 0;
const pacific = 480;
const tokyo = -540;
const kiritimati = -840;

function atOffset(isoUtc: string, timezoneOffsetMinutes: number) {
  return { now: new Date(isoUtc), timezoneOffsetMinutes };
}

test("workouts this week uses Monday 00:00 through Sunday 23:59:59 in the device timezone", () => {
  const mondayUtc = new Date("2026-11-09T08:00:00.000Z");
  const { weekStart, weekEnd } = mondayWeekBounds(mondayUtc, pacific);
  assert.equal(weekStart.toISOString(), "2026-11-09T08:00:00.000Z");
  assert.equal(weekEnd.toISOString(), "2026-11-16T08:00:00.000Z");

  assert.equal(isInMondayWeek(weekStart, mondayUtc, pacific), true);
  assert.equal(
    isInMondayWeek(new Date(weekEnd.getTime() - 1), mondayUtc, pacific),
    true,
  );
  assert.equal(isInMondayWeek(weekEnd, mondayUtc, pacific), false);
  assert.equal(
    isInMondayWeek(new Date(weekStart.getTime() - 1), mondayUtc, pacific),
    false,
  );
});

test("a Sunday late-night workout still counts in Tokyo and UTC", () => {
  const tokyoNow = new Date("2026-11-15T14:00:00.000Z");
  const tokyoSundayNight = new Date("2026-11-15T14:59:59.000Z");
  assert.equal(isInMondayWeek(tokyoSundayNight, tokyoNow, tokyo), true);
  assert.equal(
    isInMondayWeek(new Date("2026-11-15T15:00:00.000Z"), tokyoNow, tokyo),
    false,
  );

  const utcNow = new Date("2026-11-15T12:00:00.000Z");
  assert.equal(isInMondayWeek(new Date("2026-11-09T00:00:00.000Z"), utcNow, utc), true);
  assert.equal(isInMondayWeek(new Date("2026-11-15T23:59:59.000Z"), utcNow, utc), true);
  assert.equal(isInMondayWeek(new Date("2026-11-16T00:00:00.000Z"), utcNow, utc), false);
  assert.equal(isInMondayWeek(new Date("2026-11-08T23:59:59.000Z"), utcNow, utc), false);
});

test("UTC+14 week bounds stay Monday-Sunday on the device calendar", () => {
  const { now, timezoneOffsetMinutes } = atOffset("2026-11-10T10:00:00.000Z", kiritimati);
  const { weekStart, weekEnd } = mondayWeekBounds(now, timezoneOffsetMinutes);
  assert.equal(isInMondayWeek(weekStart, now, timezoneOffsetMinutes), true);
  assert.equal(isInMondayWeek(new Date(weekEnd.getTime() - 1), now, timezoneOffsetMinutes), true);
  assert.equal(isInMondayWeek(weekEnd, now, timezoneOffsetMinutes), false);
  assert.equal(weekEnd.getTime() - weekStart.getTime(), 7 * 24 * 60 * 60 * 1_000);
});

test("mute summary states match All on, N off, and Muted", () => {
  assert.equal(notificationSummary(defaultCrewNotificationPrefs), "All on");
  assert.equal(
    notificationSummary({ ...defaultCrewNotificationPrefs, crewReaction: false }),
    "1 off",
  );
  assert.equal(
    notificationSummary({
      muteAll: false,
      crewWorkout: false,
      crewComment: false,
      crewReaction: true,
    }),
    "2 off",
  );
  assert.equal(
    notificationSummary({
      muteAll: false,
      crewWorkout: false,
      crewComment: false,
      crewReaction: false,
    }),
    "3 off",
  );
  assert.equal(
    notificationSummary({
      muteAll: true,
      crewWorkout: false,
      crewComment: false,
      crewReaction: false,
    }),
    "Muted",
  );
});

test("missing notification rows default to all on", () => {
  assert.deepEqual(resolveCrewNotificationPrefs([]), defaultCrewNotificationPrefs);
  assert.equal(
    crewAlertAllowed(resolveCrewNotificationPrefs([]), "crew_workout"),
    true,
  );
  assert.equal(
    crewAlertAllowed({ ...defaultCrewNotificationPrefs, muteAll: true }, "crew_comment"),
    false,
  );
  assert.equal(
    crewAlertAllowed({ ...defaultCrewNotificationPrefs, crewReaction: false }, "crew_reaction"),
    false,
  );
});

test("owner and member permissions hide owner tools from members", () => {
  const owner = crewPagePermissions({ role: "owner", memberCount: 4 });
  assert.equal(owner.canRename, true);
  assert.equal(owner.canResetInvite, true);
  assert.equal(owner.canTransfer, true);
  assert.equal(owner.canRemoveMembers, true);
  assert.equal(owner.canLeave, false);
  assert.equal(owner.ownerMustTransferToLeave, true);
  assert.equal(owner.showSoloLeaveHelper, false);

  const member = crewPagePermissions({ role: "member", memberCount: 4 });
  assert.equal(member.canRename, false);
  assert.equal(member.canEditPhoto, false);
  assert.equal(member.canResetInvite, false);
  assert.equal(member.canTransfer, false);
  assert.equal(member.canRemoveMembers, false);
  assert.equal(member.canLeave, true);
  assert.equal(member.canCopyInvite, true);
  assert.equal(member.canShareInvite, true);

  const solo = crewPagePermissions({ role: "owner", memberCount: 1 });
  assert.equal(solo.canTransfer, false);
  assert.equal(solo.canRemoveMembers, false);
  assert.equal(solo.canLeave, true);
  assert.equal(solo.showSoloLeaveHelper, true);
  assert.equal(solo.ownerMustTransferToLeave, false);
});

test("crew copy and helpers stay on spec", () => {
  assert.equal(formatWorkoutsThisWeek(0), "0 workouts this week");
  assert.equal(formatWorkoutsThisWeek(1), "1 workout this week");
  assert.equal(firstNameForToast("Sam R."), "Sam");
  assert.equal(crewCopy.toastCopied, "Code copied");
  assert.equal(crewCopy.toastReset, "Code reset");
  assert.equal(crewCopy.toastRemoved("Sam"), "Sam removed");
  assert.match(crewCopy.removeBody("Sam"), /posts will be hidden/);
  assert.deepEqual(crewMarkTiles("Morning Crew")[0], "M");
  assert.equal(
    isCrewPhotoPathForGroup("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/photo.jpg", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    true,
  );
  assert.equal(
    isCrewPhotoPathForGroup("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/../secret.jpg", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    false,
  );
});
