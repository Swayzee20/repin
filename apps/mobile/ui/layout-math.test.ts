import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { activeDivisionFromRegions, anchoredScrollOffset, centeredCardFrame, resolveLayout, topVisibleAnchor } from "./layout-math";
import type { ReservedRegion } from "./reserved-regions-availability";
import { layout, spacing } from "./theme";

const flat = { left: 0, right: 0 };

test("useLayoutMode thresholds follow content width", () => {
  assert.equal(resolveLayout({ insets: flat, width: 599 }).mode, "compact");
  assert.equal(resolveLayout({ insets: flat, width: 600 }).mode, "wide");
  assert.equal(resolveLayout({ insets: flat, width: 759 }).mode, "wide");
  assert.equal(resolveLayout({ insets: flat, width: 760 }).mode, "twoPane");
  assert.equal(resolveLayout({ insets: { left: 84, right: 0 }, width: 683 }).mode, "compact");
  assert.equal(resolveLayout({ insets: { left: 84, right: 0 }, width: 684 }).mode, "wide");
});

test("a pane under 320 keeps the wide column", () => {
  const layout = resolveLayout({
    division: { centerX: 120, centerY: 300, height: 600, width: 24 },
    insets: flat,
    width: 900,
  });
  assert.equal(layout.contentWidth, 900);
  assert.ok(layout.split.left.width < 320);
  assert.equal(layout.mode, "wide");
});

test("951-wide window with an 84 pt right inset splits about 431.5 / 347.5", () => {
  const layout = resolveLayout({ insets: { left: 0, right: 84 }, width: 951 });
  assert.equal(layout.mode, "twoPane");
  assert.equal(layout.contentWidth, 867);
  assert.equal(layout.split.splitX, 475.5);
  assert.equal(layout.split.foldHalf, 0);
  assert.equal(layout.split.gap, 20);
  assert.equal(layout.split.left.x, 24);
  assert.equal(layout.split.left.width, 431.5);
  assert.equal(layout.split.right.x, 495.5);
  assert.equal(layout.split.right.width, 347.5);
});

test("an active 24 pt fold widens the gap", () => {
  const layout = resolveLayout({
    division: { centerX: 475.5, centerY: 334, height: 669, width: 24 },
    insets: { left: 0, right: 84 },
    width: 951,
  });
  assert.equal(layout.split.foldActive, true);
  assert.equal(layout.split.foldHalf, 12);
  assert.equal(layout.split.gap, 24);
  assert.equal(layout.split.left.width, 427.5);
  assert.equal(layout.split.right.x, 499.5);
  assert.equal(layout.split.right.width, 343.5);
  assert.equal(layout.mode, "twoPane");
});

test("a left strip mirrors the worked example", () => {
  const layout = resolveLayout({ insets: { left: 84, right: 0 }, width: 951 });
  assert.equal(layout.split.left.width, 347.5);
  assert.equal(layout.split.right.width, 431.5);
});

test("a horizontal crease does not move the columns", () => {
  const flatLayout = resolveLayout({ insets: { left: 0, right: 84 }, width: 951 });
  const tabletop = resolveLayout({
    division: { centerX: 475.5, centerY: 300, height: 24, width: 800 },
    insets: { left: 0, right: 84 },
    width: 951,
  });
  assert.equal(tabletop.split.vertical, false);
  assert.equal(tabletop.split.gap, flatLayout.split.gap);
  assert.equal(tabletop.split.left.width, flatLayout.split.left.width);
  assert.equal(tabletop.split.right.width, flatLayout.split.right.width);
});

test("centered cards use the content area, or the trailing pane when the fold is active", () => {
  const phone = centeredCardFrame({
    height: 800,
    insets: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 390,
  });
  assert.equal(phone.width, 342);
  assert.equal(phone.left, 24);

  const wide = centeredCardFrame({
    height: 800,
    insets: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 1200,
  });
  assert.equal(wide.width, 420);
  assert.equal(wide.left, 390);

  const folded = centeredCardFrame({
    division: { centerX: 475.5, centerY: 334, height: 669, width: 24 },
    height: 669,
    insets: { bottom: 0, left: 0, right: 84, top: 0 },
    width: 951,
  });
  assert.equal(folded.left, 499.5);
  assert.equal(folded.width, 367.5);
  assert.ok(folded.left >= 475.5 + 24);
});

test("non-finite sizes collapse to a compact layout instead of NaN frames", () => {
  const layout = resolveLayout({
    division: { centerX: Number.NaN, centerY: 10, height: 24, width: 800 },
    insets: { left: Number.NaN, right: -4 },
    width: Number.NaN,
  });
  assert.equal(layout.mode, "compact");
  assert.equal(layout.contentWidth, 0);
  assert.equal(layout.split.left.width, 0);
  assert.equal(layout.split.right.width, 0);
  assert.equal(Number.isFinite(layout.split.splitX), true);
  assert.equal(anchoredScrollOffset({ height: 10, y: Number.NaN }, { id: "a", offset: Number.NaN }, Number.NaN, 100), 0);
});

test("no fold region splits at width/2", () => {
  const layout = resolveLayout({ insets: flat, width: 800 });
  assert.equal(layout.mode, "twoPane");
  assert.equal(layout.split.splitX, 400);
  assert.equal(layout.split.foldActive, false);
  assert.equal(layout.split.foldHalf, 0);
  assert.equal(layout.split.vertical, false);
});

test("an off-center fold splits on the hinge and keeps panes off the crease", () => {
  const region: ReservedRegion = {
    frame: { height: 800, width: 20, x: 590, y: 0 },
    kind: "division",
    occludesContent: false,
  };
  const division = activeDivisionFromRegions([region]);
  assert.equal(division?.centerX, 600);
  const layout = resolveLayout({ division, insets: flat, width: 1000 });
  assert.equal(layout.split.splitX, 600);
  assert.equal(layout.split.foldActive, true);
  assert.equal(layout.mode, "twoPane");
  assert.ok(layout.split.left.x + layout.split.left.width <= layout.split.splitX - layout.split.gap);
  assert.ok(layout.split.right.x >= layout.split.splitX + layout.split.gap);
});

test("pane width clamps at zero when the fold leaves no room", () => {
  const layout = resolveLayout({
    division: { centerX: 10, centerY: 400, height: 800, width: 20 },
    insets: flat,
    width: 1000,
  });
  assert.equal(layout.split.left.width, 0);
  assert.ok(layout.split.right.width > 0);
  assert.equal(layout.split.foldActive, true);
});

test("a wide card inset puts the folded dialog at 16–365.7", () => {
  const wideInset = spacing.lg * 2;
  assert.equal(wideInset, 32);
  const folded = centeredCardFrame({
    cardInset: wideInset,
    height: 800,
    insets: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 381.7,
  });
  assert.equal(folded.left, 16);
  assert.equal(folded.width, 349.7);
  assert.equal(folded.left + folded.width, 365.7);
  const inner = folded.width - spacing.lg * 2;
  assert.equal(inner, 317.7);
  assert.equal(Math.round((inner / 7) * 10) / 10, 45.4);

  const unchanged = centeredCardFrame({
    height: 800,
    insets: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 381.7,
  });
  assert.equal(unchanged.left, 24);
  assert.equal(unchanged.width, 333.7);
  assert.equal(unchanged.left + unchanged.width, 357.7);
});

test("a wide inset still fills a 370-wide trailing pane at its leading edge", () => {
  const unfolded = centeredCardFrame({
    cardInset: spacing.lg * 2,
    division: { centerX: 473, centerY: 400, height: 800, width: 24 },
    height: 800,
    insets: { bottom: 0, left: 0, right: 84, top: 0 },
    width: 951,
  });
  assert.equal(unfolded.left, 497);
  assert.equal(unfolded.width, 370);
  assert.equal(unfolded.left + unfolded.width, 867);
  assert.equal(Math.min(layout.formMax, 370), 370);
  const inner = unfolded.width - spacing.lg * 2;
  assert.equal(inner, 338);
  assert.equal(Math.round((inner / 7) * 10) / 10, 48.3);

  const existingFold = centeredCardFrame({
    cardInset: spacing.lg * 2,
    division: { centerX: 475.5, centerY: 334, height: 669, width: 24 },
    height: 669,
    insets: { bottom: 0, left: 0, right: 84, top: 0 },
    width: 951,
  });
  assert.equal(existingFold.left, 499.5);
  assert.equal(existingFold.width, 367.5);
});

test("scroll anchors restore the top visible item", () => {
  const items = [
    { height: 80, id: "greeting", y: 0 },
    { height: 120, id: "snapshot", y: 80 },
    { height: 64, id: "week", y: 200 },
  ];
  assert.deepEqual(topVisibleAnchor(items, 0), { id: "greeting", offset: 0 });
  assert.deepEqual(topVisibleAnchor(items, 100), { id: "snapshot", offset: 20 });
  assert.equal(topVisibleAnchor([], 0), null);
});
