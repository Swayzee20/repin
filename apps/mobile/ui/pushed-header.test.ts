import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedNavigationBarHeight,
  pushedShowsRoundBack,
} from "./pushed-header";
import { colors, size } from "./theme";
import type { StripState } from "./vertical-bar-edge-store";

const strips: StripState[] = [
  { status: "pending", edge: null },
  { status: "known", edge: null },
  { status: "unsupported", edge: null },
  { status: "known", edge: "leading" },
  { status: "known", edge: "trailing" },
];

function sourceOf(relativePath: string) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

test("the native pushed header is iOS only", () => {
  assert.equal(pushedNativeHeaderEnabled("ios"), true);
  assert.equal(pushedNativeHeaderEnabled("android"), false);
  assert.equal(pushedNativeHeaderEnabled("web"), false);

  assert.equal(pushedShowsRoundBack("ios"), false);
  assert.equal(pushedShowsRoundBack("android"), true);
  assert.equal(pushedShowsRoundBack("web"), true);
});

test("a transparent bar clears content only when it sits on top", () => {
  assert.equal(pushedNavigationBarHeight, size.hit);
  for (const strip of strips) {
    const expected = strip.edge === null ? size.hit : 0;
    assert.equal(pushedHeaderClearance("ios", strip), expected);
    assert.equal(pushedHeaderClearance("android", strip), 0);
    assert.equal(pushedHeaderClearance("web", strip), 0);
  }
});

test("the iOS header is transparent, untitled, and keeps the back button", () => {
  const options = pushedHeaderScreenOptions();
  assert.equal(options.headerShown, true);
  assert.equal(options.headerTransparent, true);
  assert.equal(options.title, "");
  assert.equal(options.headerTitle, "");
  assert.equal(options.headerLargeTitle, false);
  assert.equal(options.headerLargeTitleEnabled, false);
  assert.equal(options.headerBackTitle, "");
  assert.equal(options.headerBackButtonDisplayMode, "minimal");
  assert.equal(options.headerBackVisible, true);
  assert.equal(options.headerShadowVisible, false);
  assert.equal(options.headerTintColor, colors.ink);
});

test("Settings keeps the labeled Sign out button and adds no strip action", () => {
  const code = sourceOf("../app/settings.tsx");

  assert.equal(code.includes("getVerticalBarEdge("), false);
  assert.equal(code.includes(".getVerticalBarEdge"), false);
  assert.equal(code.includes("useStripState"), true);
  assert.equal(code.includes("pushedNativeHeaderEnabled"), true);
  assert.equal(code.includes("pushedShowsRoundBack"), true);
  assert.equal(code.includes("pushedHeaderClearance"), true);
  assert.equal(code.includes("pushedHeaderScreenOptions"), true);
  assert.equal(code.includes("<Stack.Toolbar"), false);
  assert.equal(code.includes("rectangle.portrait.and.arrow.right"), false);
  assert.equal(code.includes(">Sign out<"), true);
  assert.equal(code.includes("Delete account"), true);
  assert.equal(code.includes('variant="prominent"'), false);
});

test("group detail shares from the strip and keeps ambiguous actions in the page", () => {
  const code = sourceOf("../app/groups/[id].tsx");

  assert.equal(code.includes("getVerticalBarEdge("), false);
  assert.equal(code.includes(".getVerticalBarEdge"), false);
  assert.equal(code.includes("useStripState"), true);
  assert.equal(code.includes("pushedNativeHeaderEnabled"), true);
  assert.equal(code.includes("pushedShowsRoundBack"), true);
  assert.equal(code.includes("pushedHeaderClearance"), true);
  assert.equal(code.includes("pushedHeaderScreenOptions"), true);
  assert.equal(code.includes("nativeHeader && group?.inviteCode"), true);
  assert.equal(code.split('<Stack.Toolbar placement="right">').length - 1, 1);
  assert.equal(code.includes('icon="square.and.arrow.up"'), true);
  assert.equal(code.includes('accessibilityLabel="Share"'), true);
  assert.equal(code.split("onPress={onShareInvite}").length - 1, 2);
  assert.equal(code.includes("void shareInvite(group.name, inviteCode)"), true);
  assert.equal(code.includes("Copy code"), true);
  assert.equal(code.includes("Log workout"), true);
  assert.equal(code.includes('variant="prominent"'), false);
  assert.equal(code.includes("roundBack ?"), true);
});

test("join by code uses the native back button and no strip action", () => {
  const code = sourceOf("../app/groups/join.tsx");

  assert.equal(code.includes("getVerticalBarEdge("), false);
  assert.equal(code.includes(".getVerticalBarEdge"), false);
  assert.equal(code.includes("useStripState"), true);
  assert.equal(code.includes("pushedNativeHeaderEnabled"), true);
  assert.equal(code.includes("pushedShowsRoundBack"), true);
  assert.equal(code.includes("pushedHeaderClearance"), true);
  assert.equal(code.includes("pushedHeaderScreenOptions"), true);
  assert.equal(code.includes("<Stack.Toolbar"), false);
  assert.match(code, /\n\s+Find\n/);
  assert.equal(code.includes("Join Group"), true);
  assert.equal(code.split("roundBack ?").length - 1, 3);
});

test("workout form modals stay headerless with the top-left X", () => {
  const layout = sourceOf("../app/_layout.tsx");
  assert.match(layout, /const formModalOptions = \{[\s\S]*headerShown: false/);
  for (const name of [
    "groups/[id]/log-workout",
    "groups/[id]/detailed-workout",
    "groups/[id]/workouts/[sessionId]/edit",
  ]) {
    assert.equal(layout.includes(`name="${name}"`), true);
    assert.equal(layout.includes("{ ...formModalOptions, presentation }"), true);
  }

  for (const path of [
    "../app/groups/[id]/log-workout.tsx",
    "../app/groups/[id]/detailed-workout.tsx",
    "../app/groups/[id]/workouts/[sessionId]/edit.tsx",
  ]) {
    const modal = sourceOf(path);
    assert.equal(modal.includes("pushed-header"), false);
    assert.equal(modal.includes("Stack.Toolbar"), false);
    assert.equal(modal.includes("pushedHeaderScreenOptions"), false);
  }
});

test("the locked tab-root plus stays on its own header", () => {
  const stack = sourceOf("./tab-root-stack.tsx");
  assert.equal(stack.includes("pushed-header"), false);
  assert.equal(stack.includes('icon="plus"'), true);
  assert.equal(stack.includes('variant="prominent"'), true);
  assert.equal(stack.includes("toggleWorkoutChooser"), true);
});
