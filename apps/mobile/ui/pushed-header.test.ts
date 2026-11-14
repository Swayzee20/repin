import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  crewMeasuredHeaderClearance,
  crewMeasuredHeaderClearanceMax,
  crewPushedHeaderInset,
  pushedHeaderClearance,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedNavigationBarHeight,
  pushedShowsRoundBack,
} from "./pushed-header";
import { colors, size } from "./theme";
import { stripPresent, type StripState } from "./vertical-bar-edge-store";

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

test("crew inset clears the native bar on a strip without doubling phone padding", () => {
  for (const strip of strips) {
    const clearance = pushedHeaderClearance("ios", strip);
    const inset = crewPushedHeaderInset("ios", strip);
    assert.equal(inset, size.hit);
    if (stripPresent(strip)) {
      assert.equal(clearance, 0);
    } else {
      assert.equal(inset, clearance);
    }
    assert.equal(crewPushedHeaderInset("android", strip), 0);
    assert.equal(crewPushedHeaderInset("web", strip), 0);
  }
});

const noStrip: StripState = { status: "known", edge: null };
const trailingStrip: StripState = { status: "known", edge: "trailing" };
const leadingStrip: StripState = { status: "known", edge: "leading" };

function measure(
  platform: string,
  strip: StripState,
  headerHeight: number,
  safeTop: number,
) {
  return crewMeasuredHeaderClearance({ headerHeight, platform, safeTop, strip });
}

test("crew measured extra subtracts SafeArea top instead of stacking it", () => {
  const headerHeight = 103;
  const safeTop = 59;
  for (const strip of strips) {
    const extra = measure("ios", strip, headerHeight, safeTop);
    assert.equal(extra, size.hit);
    assert.equal(safeTop + extra, headerHeight);
    assert.notEqual(extra, headerHeight);
    assert.notEqual(extra, headerHeight + safeTop);
  }
});

test("crew measured extra follows header height across rotation inputs", () => {
  const portrait = measure("ios", trailingStrip, 96, 0);
  const landscape = measure("ios", trailingStrip, 78, 0);
  assert.equal(portrait, 96);
  assert.equal(landscape, 78);
  assert.notEqual(portrait, landscape);

  const phonePortrait = measure("ios", noStrip, 103, 59);
  const phoneLandscape = measure("ios", noStrip, 76, 0);
  assert.equal(phonePortrait, size.hit);
  assert.equal(phoneLandscape, 76);

  const foldedThenOpen = measure("ios", leadingStrip, 64, 0);
  const unfoldedPortrait = measure("ios", noStrip, 103, 59);
  assert.equal(foldedThenOpen, 64);
  assert.equal(unfoldedPortrait, size.hit);
});

test("crew measured extra keeps the 44 floor on every strip state and platform", () => {
  assert.equal(crewMeasuredHeaderClearanceMax, size.hit * 4);
  for (const strip of strips) {
    assert.equal(measure("ios", strip, size.hit, 0), size.hit);
    assert.equal(measure("ios", strip, 20, 0), size.hit);
    assert.equal(measure("ios", strip, 96, 0) >= size.hit, true);
    assert.equal(measure("android", strip, 96, 0), 0);
    assert.equal(measure("web", strip, 96, 24), 0);
  }
});

test("crew measured extra falls back when header height or safeTop is not a usable number", () => {
  for (const strip of strips) {
    const fallback = crewPushedHeaderInset("ios", strip);
    assert.equal(fallback, size.hit);
    for (const headerHeight of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, -44]) {
      assert.equal(measure("ios", strip, headerHeight, 0), fallback);
      assert.equal(measure("ios", strip, headerHeight, 59), fallback);
    }
    for (const safeTop of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -12, -44]) {
      assert.equal(measure("ios", strip, 96, safeTop), fallback);
      assert.notEqual(measure("ios", strip, 96, safeTop), 96);
      assert.equal(measure("android", strip, 96, safeTop), 0);
      assert.equal(measure("web", strip, 96, safeTop), 0);
    }
    assert.equal(measure("ios", strip, 96, 0), 96);
    assert.equal(measure("android", strip, Number.NaN, 0), 0);
    assert.equal(measure("web", strip, Number.POSITIVE_INFINITY, 0), 0);
  }
});

test("crew measured extra clamps extremes and never exceeds the token cap", () => {
  for (const strip of strips) {
    assert.equal(measure("ios", strip, 400, 0), crewMeasuredHeaderClearanceMax);
    assert.equal(measure("ios", strip, 400, 59), crewMeasuredHeaderClearanceMax);
    assert.equal(measure("ios", strip, 1_000, 0), crewMeasuredHeaderClearanceMax);
    assert.equal(measure("ios", strip, 1_000, -50), size.hit);
    assert.ok(measure("ios", strip, 400, 0) <= crewMeasuredHeaderClearanceMax);
    assert.ok(measure("ios", strip, 400, 0) >= size.hit);
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
  assert.equal(code.includes("DangerZoneCard"), true);
  assert.equal(sourceOf("./danger-zone.tsx").includes("Delete account"), true);
  assert.equal(code.includes('variant="prominent"'), false);
});

test("crew page keeps the pushed back control and page-local invite actions", () => {
  const code = sourceOf("../app/groups/[id].tsx");

  assert.equal(code.includes("getVerticalBarEdge("), false);
  assert.equal(code.includes(".getVerticalBarEdge"), false);
  assert.equal(code.includes("useStripState"), true);
  assert.equal(code.includes("pushedNativeHeaderEnabled"), true);
  assert.equal(code.includes("pushedShowsRoundBack"), true);
  assert.equal(code.includes("crewMeasuredHeaderClearance"), true);
  assert.equal(code.includes("crewPushedHeaderInset"), false);
  assert.equal(code.includes("pushedHeaderClearance"), false);
  assert.equal(code.includes("pushedHeaderScreenOptions"), true);
  assert.equal(code.includes('headerTitle: "Crew"'), true);
  assert.equal(code.includes("<Stack.Toolbar"), false);
  assert.equal(code.includes("Copy"), true);
  assert.equal(code.includes("Share"), true);
  assert.equal(code.includes("Leave crew"), true);
  assert.equal(code.includes("Delete crew"), false);
  assert.equal(code.includes('variant="prominent"'), false);
  assert.equal(code.includes("roundBack ?"), true);
});

test("crew page wires measured clearance on one outer wrapper and does not change TwoPane", () => {
  const crew = sourceOf("../app/groups/[id].tsx");
  const layout = sourceOf("./layout.tsx");
  const settings = sourceOf("../app/settings.tsx");
  const join = sourceOf("../app/groups/join.tsx");
  const blocked = sourceOf("../app/blocked-accounts.tsx");

  assert.match(crew, /from "expo-router\/react-navigation"/);
  assert.match(crew, /const insets = useSafeAreaInsets\(\);/);
  assert.match(crew, /const headerHeight = useHeaderHeight\(\);/);
  assert.equal((crew.match(/useHeaderHeight\(/g) ?? []).length, 1);
  assert.equal((crew.match(/useSafeAreaInsets\(/g) ?? []).length, 1);
  assert.match(
    crew,
    /const headerClearance = crewMeasuredHeaderClearance\(\{\s+headerHeight,\s+platform: Platform\.OS,\s+safeTop: insets\.top,\s+strip,\s+\}\);/,
  );
  assert.equal((crew.match(/paddingTop: headerClearance/g) ?? []).length, 1);
  assert.match(
    crew,
    /style=\{headerClearance > 0 \? \[styles\.flex, \{ paddingTop: headerClearance \}\] : styles\.flex\}/,
  );
  assert.match(crew, /<TwoPane[\s\S]*fallback="stack"/);
  assert.equal(crew.includes("contentInsetAdjustmentBehavior"), false);
  assert.equal(crew.includes("automaticallyAdjustContentInsets"), false);
  assert.equal(crew.includes("automaticallyAdjustsScrollIndicatorInsets"), false);
  assert.equal(crew.includes("paddingTop: headerHeight"), false);
  assert.equal(crew.includes("headerClearance +"), false);

  assert.equal(layout.includes("crewMeasuredHeaderClearance"), false);
  assert.equal(layout.includes("useHeaderHeight"), false);
  assert.equal(layout.includes("contentInsetAdjustmentBehavior"), false);

  for (const other of [settings, join, blocked]) {
    assert.equal(other.includes("crewMeasuredHeaderClearance"), false);
    assert.equal(other.includes("useHeaderHeight"), false);
    assert.equal(other.includes("pushedHeaderClearance"), true);
  }
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
  assert.equal(code.includes("Join Crew"), true);
  assert.equal(code.split("roundBack ?").length - 1, 3);
});

test("workout form modals stay headerless with the top-left X", () => {
  const layout = sourceOf("../app/_layout.tsx");
  assert.match(layout, /const formModalOptions = \{[\s\S]*headerShown: false/);
  for (const name of [
    "groups/[id]/log-workout",
    "groups/[id]/detailed-workout",
    "groups/[id]/workouts/[sessionId]/edit",
    "goals/new",
    "goals/[id]/edit",
  ]) {
    assert.equal(layout.includes(`name="${name}"`), true);
    assert.equal(layout.includes("{ ...formModalOptions, presentation }"), true);
  }

  for (const path of [
    "../app/groups/[id]/log-workout.tsx",
    "../app/groups/[id]/detailed-workout.tsx",
    "../app/groups/[id]/workouts/[sessionId]/edit.tsx",
    "../app/goals/new.tsx",
    "../app/goals/[id]/edit.tsx",
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

test("history, bests, and personal workout detail keep pushed-header chrome", () => {
  for (const path of ["../app/history/index.tsx", "../app/bests/index.tsx", "../app/history/[sessionId].tsx"]) {
    const code = sourceOf(path);
    assert.equal(code.includes("getVerticalBarEdge("), false);
    assert.equal(code.includes(".getVerticalBarEdge"), false);
    assert.equal(code.includes("useStripState"), true);
    assert.equal(code.includes("pushedNativeHeaderEnabled"), true);
    assert.equal(code.includes("pushedShowsRoundBack"), true);
    assert.equal(code.includes("pushedHeaderClearance"), true);
    assert.equal(code.includes("pushedHeaderScreenOptions"), true);
    assert.equal(code.includes("<Stack.Toolbar"), false);
  }
});
