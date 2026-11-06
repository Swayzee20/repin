import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

test("Notifications Turn on waits for BottomSheet afterClose, not a second modal", () => {
  const sheets = source("crew-sheets.tsx");
  const turnOn = sheets.slice(
    sheets.indexOf("deviceAlertsOn ? null"),
    sheets.indexOf("styles.muteRow"),
  );
  assert.match(turnOn, /close\(\(\) => onEnableDeviceAlerts\(\)\)/);
  assert.equal(turnOn.includes("onPress={onEnableDeviceAlerts}"), false);
});

test("BottomSheet handoff uses iOS Modal onDismiss after visible=false and has no timer", () => {
  const sheet = source("sheet.tsx");
  assert.match(sheet, /type: "nativeDismissed"/);
  assert.match(sheet, /type: "visibleFalseCommitted"/);
  assert.match(sheet, /type: "animationEnded"/);
  assert.equal(sheet.includes("setTimeout"), false);
  assert.equal(sheet.includes("setInterval"), false);
  assert.match(sheet, /finished, type: "animationEnded"/);
  const animationHandler = sheet.slice(
    sheet.indexOf("]).start(({ finished }) => {"),
    sheet.indexOf("closeRef.current = close;"),
  );
  assert.equal(animationHandler.includes("runAfterClose"), false);
  assert.equal(animationHandler.includes("afterClose()"), false);
});

test("host does not request OS permission until the pre-prompt primary, and skips web launch", () => {
  const host = source("push-notifications-host.tsx");
  assert.match(host, /shouldLaunchExistingMemberPrompt/);
  assert.match(host, /shouldRefreshPermissionOnAppState/);
  assert.match(host, /requestPushPermission/);
  const primary = host.slice(host.indexOf("const allowNotifications"));
  assert.match(primary, /requestPushPermission/);
  const show = host.slice(
    host.indexOf("const showPreprompt"),
    host.indexOf("const allowNotifications"),
  );
  assert.equal(show.includes("requestPushPermission"), false);
  assert.equal(show.includes("setTimeout"), false);
});
