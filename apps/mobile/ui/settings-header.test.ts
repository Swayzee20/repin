import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  settingsHeaderClearance,
  settingsHeaderScreenOptions,
  settingsNativeHeaderEnabled,
  settingsNavigationBarHeight,
  settingsShowsRoundBack,
} from "./settings-header";
import { colors, size } from "./theme";
import type { StripState } from "./vertical-bar-edge-store";

const strips: StripState[] = [
  { status: "pending", edge: null },
  { status: "known", edge: null },
  { status: "unsupported", edge: null },
  { status: "known", edge: "leading" },
  { status: "known", edge: "trailing" },
];

test("the native Settings header is iOS only", () => {
  assert.equal(settingsNativeHeaderEnabled("ios"), true);
  assert.equal(settingsNativeHeaderEnabled("android"), false);
  assert.equal(settingsNativeHeaderEnabled("web"), false);

  assert.equal(settingsShowsRoundBack("ios"), false);
  assert.equal(settingsShowsRoundBack("android"), true);
  assert.equal(settingsShowsRoundBack("web"), true);
});

test("a transparent bar clears content only when it sits on top", () => {
  assert.equal(settingsNavigationBarHeight, size.hit);
  for (const strip of strips) {
    const expected = strip.edge === null ? size.hit : 0;
    assert.equal(settingsHeaderClearance("ios", strip), expected);
    assert.equal(settingsHeaderClearance("android", strip), 0);
    assert.equal(settingsHeaderClearance("web", strip), 0);
  }
});

test("the iOS header is transparent, untitled, and keeps the back button", () => {
  const options = settingsHeaderScreenOptions();
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

test("Settings adds one toolbar action and reads the strip from the shared store", () => {
  const source = readFileSync(new URL("../app/settings.tsx", import.meta.url), "utf8");
  const code = source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");

  assert.equal(code.includes("getVerticalBarEdge("), false);
  assert.equal(code.includes(".getVerticalBarEdge"), false);
  assert.equal(code.includes("useStripState"), true);
  assert.equal(code.includes("settingsNativeHeaderEnabled"), true);
  assert.equal(code.includes("settingsShowsRoundBack"), true);
  assert.equal(code.includes("settingsHeaderClearance"), true);
  assert.equal(code.includes("settingsHeaderScreenOptions"), true);
  assert.equal(code.split('<Stack.Toolbar placement="right">').length - 1, 1);
  assert.equal(code.includes('icon="rectangle.portrait.and.arrow.right"'), true);
  assert.equal(code.includes('accessibilityLabel="Sign out"'), true);
  assert.equal(code.includes('variant="prominent"'), false);
});
