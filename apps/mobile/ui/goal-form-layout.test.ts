import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { goalFormOverlapsStrip, goalFormSavePlacement, goalFormSheetFrame } from "./goal-form-layout";
import {
  countedVolumeSports,
  distanceVolumeSports,
  goalKindTiles,
  laneTiles,
  scheduleTiles,
  timeSportTiles,
  volumeMetricTiles,
} from "./goal-form-state";
import { paneSplit } from "./layout-math";
import { layout } from "./theme";

const strip = { left: 0, right: 84 };
const phone = { left: 0, right: 0 };

const postures = [
  { frameWidth: null, insets: strip, name: "folded", windowWidth: 466 },
  { frameWidth: null, insets: strip, name: "unfolded", windowWidth: 951 },
  { frameWidth: 951, insets: strip, name: "unfolded-full-screen", windowWidth: 951 },
  { frameWidth: 653, insets: strip, name: "unfolded-page-sheet", windowWidth: 951 },
  { frameWidth: null, insets: strip, name: "split-medium", windowWidth: 678 },
  { frameWidth: 678, insets: strip, name: "split-medium-sheet", windowWidth: 678 },
  { frameWidth: null, insets: strip, name: "split-narrow", windowWidth: 507 },
  { frameWidth: 390, insets: phone, name: "phone", windowWidth: 390 },
  { frameWidth: null, insets: { left: 84, right: 0 }, name: "folded-leading", windowWidth: 466 },
] as const;

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

test("goal Type, Metric, Sport, and Distance chips all have visible labels", () => {
  const rows = [
    goalKindTiles,
    volumeMetricTiles,
    distanceVolumeSports,
    countedVolumeSports,
    timeSportTiles,
    laneTiles,
    scheduleTiles,
  ];
  for (const row of rows) {
    assert.ok(row.length > 0);
    for (const tile of row) {
      assert.equal(typeof tile.label, "string");
      assert.ok(tile.label.trim().length > 0, `empty chip label in ${JSON.stringify(tile)}`);
    }
  }

  const form = source("goal-form.tsx");
  const tiles = form.match(/<ChoiceTile[\s\S]*?\/>/g) ?? [];
  assert.ok(tiles.length >= 6);
  for (const tile of tiles) {
    assert.match(tile, /\blabel=\{(?:tile\.label|unit)\}/);
  }
});

test("the goal sheet stays in the content pane with Save sticky at the bottom", () => {
  assert.equal(goalFormSavePlacement, "bottom");

  for (const posture of postures) {
    const frame = goalFormSheetFrame(posture);
    const hostWidth = posture.frameWidth ?? posture.windowWidth;
    assert.equal(frame.twoPane, false, `${posture.name} used TwoPane`);
    assert.equal(frame.savePlacement, "bottom", `${posture.name} Save was not bottom`);
    assert.ok(frame.width <= layout.maxReadable, `${posture.name} wider than maxReadable`);
    assert.ok(frame.width <= frame.paneWidth + 0.5, `${posture.name} wider than the content pane`);
    assert.equal(
      goalFormOverlapsStrip(frame, hostWidth, posture.insets),
      false,
      `${posture.name} overlaps the side strip`,
    );
    assert.ok(frame.left >= posture.insets.left - 0.5, `${posture.name} starts under the leading inset`);
    assert.ok(
      frame.left + frame.width <= hostWidth - posture.insets.right + 0.5,
      `${posture.name} ends under the trailing inset`,
    );
  }

  const unfolded = goalFormSheetFrame({ frameWidth: null, insets: strip, windowWidth: 951 });
  assert.equal(unfolded.paneWidth, 951 - 84);
  assert.equal(unfolded.width, layout.maxReadable);
  assert.equal(unfolded.left, (unfolded.paneWidth - unfolded.width) / 2);
  assert.ok(unfolded.left + unfolded.width <= 951 - 84);

  const splitNarrow = goalFormSheetFrame({ frameWidth: null, insets: strip, windowWidth: 507 });
  assert.equal(splitNarrow.width, 507 - 84);
  assert.equal(splitNarrow.left, 0);

  const pageSheet = goalFormSheetFrame({ frameWidth: 653, insets: strip, windowWidth: 951 });
  assert.equal(pageSheet.twoPane, false);
  assert.ok(pageSheet.left + pageSheet.width <= 653 - 84 + 0.5);
});

test("a TwoPane Save on the window's right pane would clip outside a page sheet", () => {
  const windowWidth = 951;
  const sheetWidth = 653;
  const split = paneSplit({ insets: strip, width: windowWidth });
  assert.ok(
    split.right.x + split.right.width > sheetWidth,
    "window-relative TwoPane right pane must extend past a nested page sheet",
  );
  const frame = goalFormSheetFrame({ frameWidth: sheetWidth, insets: strip, windowWidth });
  assert.equal(frame.twoPane, false);
  assert.equal(frame.savePlacement, "bottom");
  assert.ok(frame.left + frame.width <= sheetWidth - strip.right + 0.5);
});

test("the goal form scaffold never uses TwoPane and pins Save in the footer", () => {
  const form = source("goal-form.tsx");
  assert.equal(form.includes("TwoPane"), false);
  assert.equal(form.includes("useLayoutMode"), false);
  assert.match(form, /goalFormSheetFrame/);
  assert.match(form, /styles\.footer/);
  assert.match(form, /\{submit\}/);
  assert.match(form, /kind="close"/);
  const closeIndex = form.indexOf('kind="close"');
  const submitIndex = form.indexOf("{submit}");
  assert.ok(closeIndex > 0 && submitIndex > closeIndex);

  const scaffold = form.slice(form.indexOf("export function GoalFormScaffold"), form.indexOf("function FieldsScroll"));
  assert.equal(scaffold.includes("twoPane ?"), false);
  assert.match(scaffold, /paddingHorizontal: spacing\.xl/);
  assert.match(scaffold, /marginLeft: frame\.left/);
  assert.match(scaffold, /width: frame\.width/);
});

test("other Goals surfaces keep chip labels and content-pane sheets", () => {
  const goals = source("goals.tsx");
  assert.match(goals, /\{tone\.label\}/);
  assert.match(goals, /goalCopy\.emptyAction/);

  const badges = source("pr-badges.tsx");
  assert.match(badges, /chip\.type === "goal" \? "Goal" : "PR"/);
  assert.equal(badges.includes("flex: 1"), false);

  const detail = readFileSync(new URL("../app/goals/[id]/index.tsx", import.meta.url), "utf8");
  assert.match(detail, /ConfirmSheet/);
  assert.match(detail, /kind="back"/);
  assert.equal(detail.includes("ChoiceTile"), false);

  const edit = readFileSync(new URL("../app/goals/[id]/edit.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/goals/new.tsx", import.meta.url), "utf8");
  assert.match(edit, /GoalFormScaffold/);
  assert.match(create, /GoalFormScaffold/);
  assert.match(edit, /Save changes/);
  assert.match(create, /Save goal/);

  const sheets = source("crew-sheets.tsx");
  assert.match(sheets, /BottomSheet/);
  assert.match(sheets, /export function ConfirmSheet/);

  const overlay = source("overlay-state.ts");
  assert.match(overlay, /export function sheetFrame/);
});
