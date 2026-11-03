import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  accessoryLabelFor,
  keyboardAccessorySnapshot,
  resetKeyboardAccessoryForTests,
  runKeyboardAccessory,
  scheduleKeyboardAccessoryReset,
  setKeyboardAccessory,
} from "./keyboard-accessory";
import {
  fieldChainProps,
  keyboardDoneAccessoryId,
  keyboardScrollProps,
  multilineAccessoryProps,
  numberPadAccessoryProps,
  showsKeyboardDoneBar,
  singleFieldReturn,
} from "./keyboard";

test("scroll views dismiss the keyboard on drag except on web", () => {
  assert.deepEqual(keyboardScrollProps("ios"), {
    keyboardDismissMode: "on-drag",
    keyboardShouldPersistTaps: "handled",
  });
  assert.deepEqual(keyboardScrollProps("android"), keyboardScrollProps("ios"));
  assert.deepEqual(keyboardScrollProps("web"), {
    keyboardDismissMode: "none",
    keyboardShouldPersistTaps: "handled",
  });
});

test("the Done bar is iOS-only and shared by multiline fields and number pads", () => {
  assert.equal(showsKeyboardDoneBar("ios"), true);
  assert.equal(showsKeyboardDoneBar("android"), false);
  assert.equal(showsKeyboardDoneBar("web"), false);
  assert.deepEqual(multilineAccessoryProps("ios"), { inputAccessoryViewID: keyboardDoneAccessoryId });
  assert.deepEqual(numberPadAccessoryProps("ios"), multilineAccessoryProps("ios"));
  assert.deepEqual(multilineAccessoryProps("android"), {});
  assert.deepEqual(multilineAccessoryProps("web"), {});
  assert.deepEqual(numberPadAccessoryProps("web"), {});
});

test("Return moves through a form and the last key submits", () => {
  const advance: string[] = [];
  const finished: string[] = [];
  const email = fieldChainProps({
    count: 2,
    index: 0,
    last: "go",
    onAdvance: () => advance.push("password"),
    onFinish: () => finished.push("submit"),
  });
  const password = fieldChainProps({
    count: 2,
    index: 1,
    last: "go",
    onAdvance: () => advance.push("nope"),
    onFinish: () => finished.push("submit"),
  });

  assert.equal(email.returnKeyType, "next");
  assert.equal(email.blurOnSubmit, false);
  email.onSubmitEditing();
  assert.deepEqual(advance, ["password"]);
  assert.deepEqual(finished, []);

  assert.equal(password.returnKeyType, "go");
  assert.equal(password.blurOnSubmit, true);
  password.onSubmitEditing();
  assert.deepEqual(advance, ["password"]);
  assert.deepEqual(finished, ["submit"]);
});

test("screen return keys match the field chains", () => {
  const screens: { count: number; keys: string[]; last: "done" | "go" | "join" | "search" | "send"; name: string }[] = [
    { count: 2, keys: ["next", "go"], last: "go", name: "sign-in" },
    { count: 5, keys: ["next", "next", "next", "next", "go"], last: "go", name: "sign-up" },
    { count: 1, keys: ["send"], last: "send", name: "forgot-password" },
    { count: 2, keys: ["next", "go"], last: "go", name: "reset-password" },
    { count: 1, keys: ["go"], last: "go", name: "create-group" },
    { count: 1, keys: ["join"], last: "join", name: "join-onboarding" },
    { count: 1, keys: ["search"], last: "search", name: "join-by-code" },
    { count: 1, keys: ["done"], last: "done", name: "settings-delete" },
    { count: 2, keys: ["next", "done"], last: "done", name: "minutes-to-seconds" },
  ];

  for (const screen of screens) {
    const keys = screensKeys(screen.count, screen.last);
    assert.deepEqual(keys, screen.keys, screen.name);
  }
});

test("a single field can dismiss without submitting", () => {
  let finished = false;
  const field = singleFieldReturn("done", () => {
    finished = true;
  });
  assert.equal(field.returnKeyType, "done");
  assert.equal(field.blurOnSubmit, true);
  field.onSubmitEditing();
  assert.equal(finished, true);

  const dismissOnly = singleFieldReturn("done");
  assert.equal(dismissOnly.returnKeyType, "done");
  assert.doesNotThrow(() => dismissOnly.onSubmitEditing());
});

test("the iOS bar says Next only when Return would move to another field", () => {
  assert.equal(accessoryLabelFor("next"), "Next");
  assert.equal(accessoryLabelFor("done"), "Done");
  assert.equal(accessoryLabelFor("go"), "Done");
  assert.equal(accessoryLabelFor(undefined), "Done");
});

test("the bar runs the focused field and ignores a stale blur", async () => {
  resetKeyboardAccessoryForTests();
  let ran = false;
  setKeyboardAccessory({
    label: "Next",
    run: () => {
      ran = true;
    },
  });
  runKeyboardAccessory();
  assert.equal(ran, true);

  const first = setKeyboardAccessory({ label: "Next", run: () => {} });
  const second = setKeyboardAccessory({ label: "Done", run: () => {} });
  scheduleKeyboardAccessoryReset(first, 15);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(second > first, true);
  assert.equal(keyboardAccessorySnapshot().label, "Done");

  const alone = setKeyboardAccessory({ label: "Next", run: () => {} });
  scheduleKeyboardAccessoryReset(alone, 15);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(keyboardAccessorySnapshot().label, "Done");
  resetKeyboardAccessoryForTests();
});

test("an out-of-range index is treated as the last field", () => {
  const field = fieldChainProps({
    count: 3,
    index: 9,
    last: "send",
    onAdvance: () => {
      throw new Error("should not advance");
    },
  });
  assert.equal(field.returnKeyType, "send");
  assert.equal(field.blurOnSubmit, true);
});

function screensKeys(count: number, last: "done" | "go" | "join" | "search" | "send") {
  return Array.from({ length: count }, (_, index) => fieldChainProps({
    count,
    index,
    last,
    onAdvance: () => {},
  }).returnKeyType);
}
