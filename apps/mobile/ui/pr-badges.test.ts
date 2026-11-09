import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { prCopy } from "./pr-copy";
import { colors } from "./theme";

test("PR chips stay on brandTint and use combined VoiceOver copy", () => {
  assert.equal(colors.brandTint, "#FFF1E6");
  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(colors.boardBorder, "#F6E3D6");
  assert.equal(prCopy.personalRecordChip, "Personal record");
  assert.equal(prCopy.overflow(1), "+1");

  const badges = readFileSync(new URL("pr-badges.tsx", import.meta.url), "utf8");
  assert.match(badges, /colors\.brandTint/);
  assert.match(badges, /colors\.brandPressed/);
  assert.match(badges, /colors\.boardBorder/);
  assert.match(badges, /prCopy\.personalRecordChip/);
  assert.match(badges, /personal records/);
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
});
