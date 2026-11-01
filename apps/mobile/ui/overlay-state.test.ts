import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { paneSplit } from "./layout-math";
import {
  chooserRowMinHeight,
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
  for (const code of [chooser, stack, empty]) assert.equal(code.includes("Rep in"), false);
  assert.match(chooser, /title="Log a workout"/);
  assert.match(chooser, /Log fast, add details if you want/);
  assert.match(stack, /accessibilityLabel="Log a workout"/);
  assert.match(stack, />\s*Log a workout\s*</);
  assert.match(empty, /accessibilityLabel="Log a workout"/);
  assert.match(empty, /No one’s repped in yet/);
  assert.match(empty, /Be the first to rep in/);
});
