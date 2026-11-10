import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { goalChipAccessibility } from "@repin/validation";

import { prCopy } from "./pr-copy";
import { colors } from "./theme";
import { mixedBadgeAccessibilityLabel, visibleMixedBadgeChips } from "./pr-badge-chips";

test("PR chips stay on brandTint and use combined VoiceOver copy", () => {
  assert.equal(colors.brandTint, "#FFF1E6");
  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(colors.boardBorder, "#F6E3D6");
  assert.equal(prCopy.personalRecordChip, "Personal record");
  assert.equal(prCopy.overflow(1), "+1");

  const badges = readFileSync(new URL("pr-badges.tsx", import.meta.url), "utf8");
  const chips = readFileSync(new URL("pr-badge-chips.ts", import.meta.url), "utf8");
  assert.match(badges, /colors\.brandTint/);
  assert.match(badges, /colors\.brandPressed/);
  assert.match(badges, /colors\.boardBorder/);
  assert.match(chips, /prCopy\.personalRecordChip/);
  assert.match(chips, /personal records/);
  assert.equal(badges.includes("gold"), false);

  const components = readFileSync(new URL("components.tsx", import.meta.url), "utf8");
  assert.equal(components.includes("brandTint"), false);
  assert.match(components, /PrBadgeRow/);

  const detail = readFileSync(new URL("workout-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /prCopy.unshare/);
  assert.match(detail, /PrUndoToast/);

  const log = readFileSync(new URL("../app/groups/[id]/log-workout.tsx", import.meta.url), "utf8");
  const detailed = readFileSync(new URL("../app/groups/[id]/detailed-workout.tsx", import.meta.url), "utf8");
  assert.match(log, /PrLogOverlay/);
  assert.match(detailed, /PrLogOverlay/);
  assert.match(log, /Duration \(minutes\)/);
  assert.match(detailed, /Duration \(minutes\)/);
});

test("mixed Goal and PR chips show one of each then +N, and Goal uses an outline chip", () => {
  const mixed = visibleMixedBadgeChips(
    [{ id: "g1", label: "5K", periodId: "p1", value: "19:59" }, { id: "g2", label: "Miles", periodId: "p2", value: "20" }],
    [{ id: "pr1", key: "dt:run:5k", kind: "distance_time", label: "5K", value: "19:59" }],
  );
  assert.deepEqual(mixed.chips, [
    { id: "g1", type: "goal" },
    { id: "pr1", type: "pr" },
  ]);
  assert.equal(mixed.overflow, 1);
  assert.equal(mixed.accessibilityLabel, "2 goals reached and personal record");
  assert.equal(goalChipAccessibility.mixed(2, 1), "2 goals reached and personal record");
  assert.equal(mixedBadgeAccessibilityLabel(1, 1), "Goal reached and personal record");

  const goalsOnly = visibleMixedBadgeChips(
    [{ id: "g1", label: "A", periodId: "p1", value: "1" }, { id: "g2", label: "B", periodId: "p2", value: "2" }, { id: "g3", label: "C", periodId: "p3", value: "3" }],
    [],
  );
  assert.equal(goalsOnly.chips.length, 2);
  assert.equal(goalsOnly.overflow, 1);
  assert.equal(goalsOnly.chips.every((chip) => chip.type === "goal"), true);

  const badges = readFileSync(new URL("pr-badges.tsx", import.meta.url), "utf8");
  assert.match(badges, /styles\.goalChip/);
  assert.match(badges, /colors\.brand/);
  assert.match(badges, /borderWidth: 2/);
  assert.equal(badges.includes("gold"), false);
});
