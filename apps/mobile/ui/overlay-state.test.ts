import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { paneSplit } from "./layout-math";
import {
  chooserMeasuredAnchor,
  chooserMotion,
  chooserPanel,
  chooserPanelFrame,
  chooserRowMinHeight,
  chooserSwipeDistanceFraction,
  chooserSwipeShouldDismiss,
  chooserSwipeVelocity,
  dateActionHeight,
  menuItemColor,
  menuItemMinHeight,
  sheetDismissDistance,
  sheetFrame,
  sheetRowBackground,
  sheetRowMinHeight,
  stateActionHeight,
  stateIconSize,
} from "./overlay-state";
import { colors, size, spacing } from "./theme";

test("sheet rows stay at least 48 and the chooser keeps 72", () => {
  assert.equal(sheetRowMinHeight, size.control);
  assert.ok(sheetRowMinHeight >= 48);
  assert.equal(chooserRowMinHeight, 72);
  assert.ok(chooserRowMinHeight >= sheetRowMinHeight);
  assert.equal(sheetDismissDistance, spacing.huge + spacing.xxxl);
});

test("menu rows match list rows and danger text uses the danger colour", () => {
  assert.equal(menuItemMinHeight, size.primary);
  assert.ok(menuItemMinHeight >= 44);
  assert.equal(menuItemColor(false), colors.ink);
  assert.equal(menuItemColor(true), colors.danger);
});

test("state card action is 48 and its icon slot is 36", () => {
  assert.equal(stateActionHeight, size.control);
  assert.equal(stateIconSize, size.iconButton);
  assert.equal(stateIconSize, 36);
});

test("date picker actions are 44pt buttons", () => {
  assert.equal(dateActionHeight, size.hit);
  assert.equal(dateActionHeight, 44);
});

test("a pressed or selected sheet row uses the selection fill", () => {
  assert.equal(sheetRowBackground(false, false), "transparent");
  assert.equal(sheetRowBackground(true, false), colors.selection);
  assert.equal(sheetRowBackground(false, true), colors.selection);
  assert.equal(sheetRowBackground(true, true), colors.selection);
});

test("a phone sheet is full width and a folded sheet stays in the trailing pane", () => {
  const phoneSplit = paneSplit({ insets: { left: 0, right: 0 }, width: 390 });
  const phone = sheetFrame({
    height: 800,
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
    split: phoneSplit,
    width: 390,
  });
  assert.equal(phone.left, 0);
  assert.equal(phone.width, 390);

  const stripSplit = paneSplit({ insets: { left: 84, right: 0 }, width: 390 });
  const strip = sheetFrame({
    height: 800,
    insets: { bottom: 0, left: 84, right: 0, top: 0 },
    split: stripSplit,
    width: 390,
  });
  assert.equal(strip.left, 84);
  assert.equal(strip.width, 306);
  assert.ok(phone.maxHeight < 800);
  assert.ok(phone.maxHeight > 0);

  const foldedSplit = paneSplit({
    division: { centerX: 475.5, centerY: 334, height: 669, width: 24 },
    insets: { left: 0, right: 84 },
    width: 951,
  });
  const folded = sheetFrame({
    height: 669,
    insets: { bottom: 0, left: 0, right: 84, top: 0 },
    split: foldedSplit,
    width: 951,
  });
  assert.equal(folded.left, foldedSplit.right.x);
  assert.ok(folded.left > 475.5);
  assert.equal(folded.width, 951 - 84 - folded.left);
  assert.ok(folded.left + folded.width <= 951 - 84);
});

test("chooser panel constants match the approved side-panel geometry", () => {
  assert.equal(chooserPanel.widthFraction, 0.75);
  assert.equal(chooserPanel.stripAxisFromEdge, 48);
  assert.equal(chooserPanel.plusRadius, 24);
  assert.equal(chooserPanel.plusGap, 14);
  assert.equal(chooserPanel.topAbovePlus, 10);
  assert.equal(chooserPanel.bottomAbovePill, 16);
  assert.deepEqual(chooserPanel.caret, { height: 18, width: 8 });
  assert.equal(chooserPanel.padding.top, spacing.md);
  assert.equal(chooserPanel.padding.bottom, spacing.lg);
  assert.equal(chooserPanel.padding.horizontal, spacing.xl);
  assert.equal(chooserPanel.plusGap - chooserPanel.caret.width, 6);
  assert.deepEqual(chooserMeasuredAnchor(true), { pillTop: 483, py: 148 });
  assert.deepEqual(chooserMeasuredAnchor(false), { pillTop: 492, py: 198 });
  assert.equal(chooserSwipeDistanceFraction, 0.3);
  assert.equal(chooserSwipeVelocity, 0.5);
  assert.deepEqual(chooserMotion.openSpring, { damping: 22, mass: 1, stiffness: 260 });
});

test("chooser panel frame matches the Duo measurements, trailing and leading", () => {
  const unfolded = chooserPanelFrame({ W: 951, edge: "trailing", pillTop: 483, py: 148 });
  assert.equal(unfolded.right, 865);
  assert.equal(unfolded.width, 713);
  assert.equal(unfolded.left, 152);
  assert.equal(unfolded.top, 114);
  assert.equal(unfolded.bottomLimit, 467);
  assert.equal(unfolded.maxHeight, 353);
  assert.deepEqual(unfolded.caretTip, { x: 873, y: 148 });
  assert.deepEqual(unfolded.plusCentre, { x: 903, y: 148 });
  assert.equal(unfolded.dismissDirection, 1);
  assert.equal(unfolded.offscreenX, 951 - unfolded.left);
  assert.equal(unfolded.plusCentre.x - chooserPanel.plusRadius - unfolded.caretTip.x, 6);
  assert.equal(unfolded.caretOffsetY, 148 - 114 - chooserPanel.caret.height / 2);

  const folded = chooserPanelFrame({ W: 466, edge: "trailing", pillTop: 492, py: 198 });
  assert.equal(folded.right, 380);
  assert.equal(folded.width, 350);
  assert.equal(folded.left, 30);
  assert.equal(folded.top, 164);
  assert.equal(folded.bottomLimit, 476);
  assert.equal(folded.maxHeight, 312);
  assert.deepEqual(folded.caretTip, { x: 388, y: 198 });
  assert.deepEqual(folded.plusCentre, { x: 418, y: 198 });
  assert.equal(folded.offscreenX, 466 - folded.left);
  assert.equal(folded.plusCentre.x - chooserPanel.plusRadius - folded.caretTip.x, 6);

  const leading = chooserPanelFrame({ W: 951, edge: "leading", pillTop: 483, py: 148 });
  assert.equal(leading.left, 86);
  assert.equal(leading.width, 713);
  assert.equal(leading.right, 799);
  assert.equal(leading.top, 114);
  assert.equal(leading.maxHeight, 353);
  assert.deepEqual(leading.caretTip, { x: 78, y: 148 });
  assert.deepEqual(leading.plusCentre, { x: 48, y: 148 });
  assert.equal(leading.dismissDirection, -1);
  assert.equal(leading.offscreenX, -(leading.left + leading.width));
  assert.equal(leading.caretTip.x - (leading.plusCentre.x + chooserPanel.plusRadius), 6);

  const leadingFolded = chooserPanelFrame({ W: 466, edge: "leading", pillTop: 492, py: 198 });
  assert.equal(leadingFolded.left, 86);
  assert.equal(leadingFolded.width, 350);
  assert.equal(leadingFolded.right, 436);
  assert.equal(leadingFolded.top, 164);
  assert.equal(leadingFolded.maxHeight, 312);
  assert.deepEqual(leadingFolded.caretTip, { x: 78, y: 198 });
  assert.deepEqual(leadingFolded.plusCentre, { x: 48, y: 198 });
  assert.equal(leadingFolded.offscreenX, -(leadingFolded.left + leadingFolded.width));
  assert.equal(leadingFolded.caretTip.x - (leadingFolded.plusCentre.x + chooserPanel.plusRadius), 6);

  const measured = chooserMeasuredAnchor(true);
  const fromAnchor = chooserPanelFrame({ W: 951, edge: "trailing", ...measured });
  assert.equal(fromAnchor.top, unfolded.top);
  assert.equal(fromAnchor.caretTip.y, measured.py);
});

test("chooser panel frame stays finite when the window is not", () => {
  const frame = chooserPanelFrame({ W: Number.NaN, edge: "trailing", pillTop: Number.NaN, py: Number.POSITIVE_INFINITY });
  assert.equal(frame.left, 0);
  assert.equal(frame.width, 0);
  assert.equal(frame.maxHeight, 0);
  assert.equal(frame.offscreenX, 0);

  const tight = chooserPanelFrame({ W: 951, edge: "trailing", pillTop: 100, py: 148 });
  assert.equal(tight.maxHeight, 0);
  assert.ok(tight.top > tight.bottomLimit);
});

test("a chooser swipe dismisses past 30 percent or 500 points per second", () => {
  const width = 713;
  const limit = chooserSwipeDistanceFraction * width;
  assert.equal(chooserSwipeShouldDismiss({ distance: limit, velocity: 0, width }), false);
  assert.equal(chooserSwipeShouldDismiss({ distance: limit + 0.1, velocity: 0, width }), true);
  assert.equal(chooserSwipeShouldDismiss({ distance: 0, velocity: chooserSwipeVelocity, width }), false);
  assert.equal(chooserSwipeShouldDismiss({ distance: 0, velocity: chooserSwipeVelocity + 0.01, width }), true);
  assert.equal(chooserSwipeShouldDismiss({ distance: -20, velocity: -1, width }), false);
});

test("a sheet with no room falls back to the safe width", () => {
  const split = paneSplit({ insets: { left: 0, right: 0 }, width: 0 });
  const frame = sheetFrame({
    height: Number.NaN,
    insets: { bottom: Number.NaN, left: -8, right: Number.NaN, top: -4 },
    split,
    width: Number.NaN,
  });
  assert.equal(frame.left, 0);
  assert.equal(frame.width, 0);
  assert.equal(frame.maxHeight, 0);
  assert.equal(frame.bottomInset, 0);
});

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

test("sheet and modal close buttons lead their headers", () => {
  const sheet = source("sheet.tsx");
  const header = sheet.slice(sheet.indexOf("export function SheetHeader"), sheet.indexOf("export function BottomSheet"));
  assert.ok(header.includes("export function SheetHeader"));
  assert.ok(header.indexOf('kind="close"') < header.indexOf("{title}"));
  assert.match(sheet, /header:\s*\{[^}]*gap: spacing\.md/);
  assert.match(sheet, /title:\s*\{[^}]*flex: 1/);
  assert.ok(sheet.indexOf("<View style={styles.grabber} />") < sheet.indexOf("<SheetHeader"));

  const post = source("workout-detail-modal.tsx");
  const postHeader = post.slice(post.indexOf("<View style={styles.header}>"), post.indexOf("styles.headerCopy"));
  assert.match(postHeader, /kind="close"/);
  const focusAt = post.indexOf("accessibilityViewIsModal");
  const closeAt = post.indexOf('kind="close"');
  const scrimAt = post.indexOf("styles.backdropPressable");
  assert.ok(scrimAt < focusAt && focusAt < closeAt);

  const photo = source("photo-viewer.tsx");
  assert.match(photo, /left: insets\.left \+ spacing\.lg/);
  assert.match(photo, /top: insets\.top \+ spacing\.sm/);
  assert.equal(photo.includes("right: insets.right + spacing.lg"), false);
  assert.ok(photo.indexOf('kind="close"') < photo.indexOf("styles.backdrop"));

  const dialog = source("dialog.tsx");
  assert.equal(dialog.includes('kind="close"'), false);
});

test("log actions say Log a workout", () => {
  const chooser = source("log-workout-chooser.tsx");
  const stack = source("tab-root-stack.tsx");
  const empty = source("check-in-empty-content.tsx");
  const panel = source("side-panel.tsx");
  for (const code of [chooser, stack, empty, panel]) assert.equal(code.includes("Rep in"), false);
  assert.match(chooser, /title="Log a workout"/);
  assert.match(chooser, /Log fast, add details if you want/);
  assert.match(chooser, /Platform\.OS === "ios" && stripPresent\(strip\)/);
  assert.match(chooser, /SidePanel/);
  assert.match(chooser, /BottomSheet/);
  assert.match(stack, /accessibilityLabel="Log a workout"/);
  assert.match(stack, />\s*Log a workout\s*</);
  assert.match(stack, /toggleWorkoutChooser/);
  assert.equal(stack.includes("openWorkoutChooser"), false);
  assert.match(empty, /accessibilityLabel="Log a workout"/);
  assert.match(empty, /No one’s repped in yet/);
  assert.match(empty, /Be the first to rep in/);
  assert.match(chooser, /closeLabel="Close workout options"/);
  assert.match(panel, /chooserPanelFrame/);
  assert.match(panel, /chooserShowsPlusAnchor/);
  assert.match(panel, /accessibilityViewIsModal/);
  assert.match(panel, /onAccessibilityEscape/);
  assert.match(panel, /accessibilityLabel=\{closeLabel\}/);
  assert.match(panel, /accessibilityState=\{\{ expanded: true \}\}/);
  assert.match(panel, /Easing\.out\(Easing\.quad\)/);
  assert.match(panel, /Easing\.in\(Easing\.cubic\)/);
  assert.match(panel, /Easing\.in\(Easing\.quad\)/);
  assert.match(panel, /useReducedMotion/);
});
