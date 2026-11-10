import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { goalsSectionLayout } from "./goals-section";

test("History stays available when there are no active goals", () => {
  assert.deepEqual(goalsSectionLayout(0, 2, 5), {
    atCap: false,
    hasHistory: true,
    showHistory: true,
  });
  assert.deepEqual(goalsSectionLayout(0, 0, 5), {
    atCap: false,
    hasHistory: false,
    showHistory: false,
  });
  assert.deepEqual(goalsSectionLayout(1, 1, 5), {
    atCap: false,
    hasHistory: true,
    showHistory: true,
  });

  const source = readFileSync(new URL("./goals.tsx", import.meta.url), "utf8");
  assert.match(source, /layout\.showHistory/);
  assert.match(source, /emptyActiveTitle/);
});
