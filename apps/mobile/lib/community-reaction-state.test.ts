import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyOptimisticReaction,
  reduceWhoReactedSheet,
} from "./community-reaction-state";

/* eslint-disable @typescript-eslint/no-floating-promises */

test("who-reacted sheet opens to a type, loads, fails, and closes", () => {
  const opened = reduceWhoReactedSheet({ status: "closed" }, {
    type: "open",
    focus: "fire",
    sessionId: "s1",
  });
  assert.equal(opened.status, "open");
  if (opened.status !== "open") return;
  assert.equal(opened.focus, "fire");
  assert.equal(opened.loading, true);

  const loaded = reduceWhoReactedSheet(opened, {
    type: "loaded",
    data: {
      groups: [{
        reactionType: "fire",
        reactors: [{ userId: "u1", displayName: "Ada", isYou: true, createdAt: "2026-11-18T12:00:00.000Z" }],
      }],
    },
  });
  assert.equal(loaded.status, "open");
  if (loaded.status !== "open") return;
  assert.equal(loaded.loading, false);
  assert.equal(loaded.data?.groups[0]?.reactors[0]?.displayName, "Ada");

  const failed = reduceWhoReactedSheet(opened, { type: "failed", error: "nope" });
  assert.equal(failed.status, "open");
  if (failed.status !== "open") return;
  assert.equal(failed.error, "nope");
  assert.equal(reduceWhoReactedSheet(failed, { type: "close" }).status, "closed");
  assert.equal(reduceWhoReactedSheet({ status: "closed" }, { type: "loaded", data: { groups: [] } }).status, "closed");
});

test("optimistic reaction updates apply then restore the previous summary on rollback", () => {
  const previous = { counts: { clap: 0, fire: 2, strong: 1 }, total: 3, viewerReaction: "fire" as const };
  const next = applyOptimisticReaction(previous, "clap");
  assert.equal(next.viewerReaction, "clap");
  assert.equal(next.counts.fire, 1);
  assert.equal(next.counts.clap, 1);
  const rolled = applyOptimisticReaction(next, "clap");
  assert.equal(rolled.viewerReaction, null);
  assert.deepEqual(applyOptimisticReaction(previous, "fire").viewerReaction, null);
});
