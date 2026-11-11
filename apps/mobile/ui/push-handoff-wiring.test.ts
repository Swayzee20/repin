import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

function fn(code: string, name: string, nextName: string) {
  const start = code.indexOf(name);
  const end = code.indexOf(nextName, start + name.length);
  assert.ok(start >= 0, `${name} missing`);
  assert.ok(end > start, `${nextName} missing after ${name}`);
  return code.slice(start, end);
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
  assert.match(sheet, /if \(effect === "requestVisibleFalse"\) onDismissRef\.current\(\)/);
  assert.match(sheet, /if \(effect === "runAfterClose"\)/);
});

test("host does not request OS permission until the pre-prompt primary, and skips web launch", () => {
  const host = source("push-notifications-host.tsx");
  assert.match(host, /shouldLaunchExistingMemberPrompt/);
  assert.match(host, /shouldRefreshPermissionOnAppState/);
  assert.match(host, /mayRequestOsPermission/);
  assert.match(host, /requestPushPermission/);
  const primary = fn(host, "const allowNotifications", "useEffect(() => {\n    aliveRef.current = true");
  assert.match(primary, /requestPushPermission/);
  assert.match(primary, /mayRequestOsPermission/);
  const show = fn(host, "const showPreprompt", "const dismissSheet");
  assert.equal(show.includes("requestPushPermission"), false);
  assert.equal(show.includes("setTimeout"), false);
  assert.ok(show.indexOf("action === \"syncToken\"") < show.indexOf("setSheetVisible(true)"));
  assert.ok(show.indexOf("action === \"openSettings\"") < show.indexOf("setSheetVisible(true)"));
  assert.match(show, /isStaleGeneration/);
  assert.match(show, /aliveRef\.current/);
  assert.match(show, /if \(force && aliveRef\.current\) await Linking\.openSettings\(\)/);
  assert.equal(host.includes("Platform.OS === \"web\" ? showPreprompt"), false);
});

test("existing-member launch, join/create, and account switch share one lock", () => {
  const api = readFileSync(new URL("../lib/push-api.ts", import.meta.url), "utf8");
  assert.match(api, /export async function fetchHasCrewMembership/);
  assert.match(api, /\$\{apiUrl\}\/api\/groups/);
  const host = source("push-notifications-host.tsx");
  assert.match(host, /fetchHasCrewMembership/);
  assert.match(host, /generationRef\.current \+= 1/);
  assert.match(host, /promptAfterJoin: \(\) => \{\s*void showPreprompt\(false\);/s);
  assert.match(host, /promptFromSettings: \(\) => \{\s*void showPreprompt\(true\);/s);
  const launch = fn(host, "const accessToken = session.access_token", "useEffect(() => {\n    if (Platform.OS === \"web\")");
  assert.match(launch, /wasPushPrepromptDismissed/);
  assert.match(launch, /fetchHasCrewMembership/);
  assert.match(launch, /shouldLaunchExistingMemberPrompt/);
  assert.match(launch, /showPreprompt\(false\)/);
  assert.match(launch, /sessionRef\.current\?\.user\.id/);
});

test("afterClose callers keep onDismiss hide-only so both-run is not double navigation", () => {
  const host = source("workout-chooser-host.tsx");
  const chooser = host.slice(host.indexOf("<LogWorkoutChooser"), host.indexOf("visible={workoutChooserVisible}"));
  assert.match(chooser, /onDismiss=\{\(\) => setWorkoutChooserVisible\(false\)\}/);
  assert.match(chooser, /onQuickLog=\{\(\) => \{[\s\S]*setWorkoutChooserVisible\(false\);[\s\S]*router\.push\(`\/groups\/\$\{selectedGroupId\}\/log-workout`\)/);
  assert.match(chooser, /onDetailedWorkout=\{\(\) => \{[\s\S]*setWorkoutChooserVisible\(false\);[\s\S]*router\.push\(`\/groups\/\$\{selectedGroupId\}\/detailed-workout`\)/);
  assert.equal(chooser.includes("router.push") && chooser.includes("onDismiss={() => setWorkoutChooserVisible(false)}"), true);
  assert.equal((chooser.match(/router\.push/g) ?? []).length, 2);

  const picker = source("movement-picker.tsx");
  assert.match(picker, /onPress=\{\(\) => close\(\(\) => onConfirm\(selected\)\)\}/);
  const strength = source("detailed-workout-exercises.tsx");
  assert.match(strength, /onDismiss=\{\(\) => setPicker\(null\)\}/);
  assert.match(strength, /exercisesFromPickerSelections\(exercises, selections, picker\?\.exerciseId\)/);
  const ff = source("functional-format-fields.tsx");
  assert.match(ff, /onDismiss=\{\(\) => setPicker\(null\)\}/);
  assert.match(ff, /ffExercisesFromPicker\(exercises, selections, picker\?\.exerciseId\)/);

  const sheet = source("sheet.tsx");
  assert.match(sheet, /event\.type === "presented" \|\| event\.type === "unmounted"/);
  assert.match(sheet, /pendingAfterClose\.current = undefined/);
});

test("occupancy hooks only observe Modal hide; they do not dismiss the overlay", () => {
  const hook = source("use-overlay-occupancy.ts");
  assert.match(hook, /occupancyForVisible/);
  assert.match(hook, /occupancyForIosNativeDismiss/);
  assert.equal(hook.includes("onRequestClose"), false);
  assert.equal(hook.includes("setVisible"), false);
  const host = source("push-notifications-host.tsx");
  const switchUser = fn(host, "if (userIdRef.current !== nextUserId)", "if (session)");
  assert.match(switchUser, /setSheetVisible\(false\)/);
  assert.match(switchUser, /unlockPrompt/);
  assert.equal(switchUser.includes("markPushPrepromptDismissed"), false);
});

test("native overlays report occupancy so launch cannot stack on another sheet", () => {
  for (const name of [
    "dialog.tsx",
    "photo-viewer.tsx",
    "workout-detail-modal.tsx",
    "side-panel.tsx",
    "components.tsx",
  ]) {
    const code = source(name);
    assert.match(code, /useOverlayOccupancy/);
    assert.match(code, /onDismiss=\{onNativeDismiss\}/);
  }
  const sheet = source("sheet.tsx");
  assert.match(sheet, /acquireOverlay\(overlayId\)/);
  assert.match(sheet, /releaseOverlay\(overlayId\)/);
});
