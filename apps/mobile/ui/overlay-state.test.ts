import assert from "node:assert/strict";
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
