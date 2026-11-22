import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  distanceMetricFieldMinWidth,
  distanceMetricFieldStyle,
  distanceMetricRowStyle,
  distanceMetricRowWraps,
  distanceUnitControlMinWidth,
} from "./distance-metric-layout";
import { size, spacing } from "./theme";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

const foldedDuoContentWidth = 333;
const unfoldedLeftPaneWidth = 440;
const detailedRunLabelWidth = 64;
const detailedRunControlsWidth = foldedDuoContentWidth
  - spacing.md * 2
  - spacing.sm * 2
  - detailedRunLabelWidth
  - spacing.sm;

test("distance NumberField keeps a 120 pt min width from tokens and wraps the unit control when the row is too narrow", () => {
  assert.equal(distanceMetricFieldMinWidth, size.hit * 2 + spacing.xxxl);
  assert.equal(distanceMetricFieldMinWidth, 120);
  assert.equal(distanceMetricFieldStyle.minWidth, 120);
  assert.equal(distanceMetricFieldStyle.flexBasis, "auto");
  assert.equal(distanceMetricFieldStyle.flexGrow, 1);
  assert.equal(distanceMetricFieldStyle.flexShrink, 1);
  assert.equal(distanceMetricRowStyle.flexWrap, "wrap");
  assert.equal(distanceUnitControlMinWidth(3), size.hit * 3);
  assert.equal(distanceMetricRowWraps(detailedRunControlsWidth, 3), true);
  assert.equal(distanceMetricRowWraps(foldedDuoContentWidth, 3), false);
  assert.equal(distanceMetricRowWraps(unfoldedLeftPaneWidth, 3), false);
  assert.ok(detailedRunControlsWidth < distanceMetricFieldMinWidth + spacing.sm + distanceUnitControlMinWidth(3));
});

test("Detailed Run and Quick Log distance rows share the wrap style; strength and functional pickers stay out of scope", () => {
  const detailed = source("./detailed-run-fields.tsx");
  const quick = source("./quick-log-results.tsx");
  assert.equal((detailed.match(/distanceMetricFieldStyle/g) ?? []).length >= 3, true);
  assert.match(detailed, /distanceMetricRowStyle/);
  assert.match(quick, /distanceMetricFieldStyle/);
  assert.match(quick, /distanceMetricRowStyle/);
  assert.equal(detailed.includes("minWidth: 0"), true);
  assert.equal(quick.includes("distanceMetricFieldStyle"), true);
  const strength = source("./logging-form-state.ts");
  assert.equal(strength.includes("distanceMetricFieldStyle"), false);
});
