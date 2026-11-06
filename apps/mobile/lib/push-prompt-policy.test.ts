import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  canStartPrompt,
  dismissedStorageKey,
  isDismissedFromStoredValues,
  isStaleGeneration,
  launchPromptAllowedOnPath,
  mayRequestOsPermission,
  nextPushHandoffAction,
  shouldLaunchExistingMemberPrompt,
  shouldRefreshPermissionOnAppState,
} from "./push-prompt-policy";

const allowedLaunch = {
  dismissed: false,
  generation: 2,
  membership: true as const,
  overlayCount: 0,
  osStatus: "undetermined" as const,
  pathname: "/",
  platform: "ios" as const,
  promptLocked: false,
  responseGeneration: 2,
  sessionUserId: "user-a",
  sheetVisible: false,
};

test("settings handoff maps undetermined, denied, and granted without a native request", () => {
  assert.equal(nextPushHandoffAction("undetermined"), "preprompt");
  assert.equal(nextPushHandoffAction("denied"), "openSettings");
  assert.equal(nextPushHandoffAction("granted"), "syncToken");
});

test("OS permission request only follows the explicit pre-prompt primary on native", () => {
  assert.equal(mayRequestOsPermission({ explicitPrimary: true, platform: "ios" }), true);
  assert.equal(mayRequestOsPermission({ explicitPrimary: true, platform: "android" }), true);
  assert.equal(mayRequestOsPermission({ explicitPrimary: false, platform: "ios" }), false);
  assert.equal(mayRequestOsPermission({ explicitPrimary: true, platform: "web" }), false);
});

test("existing-member launch prompt requires undetermined, membership, and a free overlay", () => {
  assert.equal(shouldLaunchExistingMemberPrompt(allowedLaunch), true);
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, osStatus: "granted" }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, osStatus: "denied" }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, dismissed: true }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, dismissed: null }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, membership: "pending" }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, membership: false }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, membership: null }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, overlayCount: 1 }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, platform: "web" }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, sessionUserId: null }),
    false,
  );
});

test("join, create, and startup cannot duplicate a prompt that is already locked or visible", () => {
  assert.equal(canStartPrompt({ promptLocked: false, sheetVisible: false }), true);
  assert.equal(canStartPrompt({ promptLocked: true, sheetVisible: false }), false);
  assert.equal(canStartPrompt({ promptLocked: false, sheetVisible: true }), false);
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, promptLocked: true }),
    false,
  );
  assert.equal(
    shouldLaunchExistingMemberPrompt({ ...allowedLaunch, sheetVisible: true }),
    false,
  );
  assert.equal(launchPromptAllowedOnPath("/onboarding/join-group"), false);
  assert.equal(launchPromptAllowedOnPath("/onboarding/create-group"), false);
  assert.equal(launchPromptAllowedOnPath("/groups/join"), false);
  assert.equal(launchPromptAllowedOnPath("/join/ABCDEFGH"), false);
  assert.equal(launchPromptAllowedOnPath("/groups/cccccccc-cccc-4ccc-8ccc-cccccccccccc"), true);
  assert.equal(launchPromptAllowedOnPath("/sign-in"), false);
  assert.equal(launchPromptAllowedOnPath("/signup"), false);
  assert.equal(launchPromptAllowedOnPath("/"), true);
});

test("stale membership or permission work from another account does not present", () => {
  assert.equal(isStaleGeneration(3, 2), true);
  assert.equal(
    shouldLaunchExistingMemberPrompt({
      ...allowedLaunch,
      generation: 4,
      responseGeneration: 3,
    }),
    false,
  );
  assert.equal(dismissedStorageKey("user-a"), "push-preprompt-dismissed:user-a");
  assert.equal(isDismissedFromStoredValues("1", null), true);
  assert.equal(isDismissedFromStoredValues(null, "1"), true);
  assert.equal(isDismissedFromStoredValues(null, null), false);
});

test("permission refresh runs on foreground without requesting the OS prompt", () => {
  assert.equal(shouldRefreshPermissionOnAppState("active"), true);
  assert.equal(shouldRefreshPermissionOnAppState("background"), false);
  assert.equal(shouldRefreshPermissionOnAppState("inactive"), false);
});
