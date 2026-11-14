import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  pushUnregisterLog,
  resolvePushUnregisterToken,
} from "./push-unregister";

test("push unregister prefers the cached token and keeps a pending retry", () => {
  assert.equal(resolvePushUnregisterToken("cached", "pending"), "cached");
  assert.equal(resolvePushUnregisterToken(null, "pending"), "pending");
  assert.equal(resolvePushUnregisterToken(null, null), null);
});

test("push unregister logs do not include tokens or emails", () => {
  for (const kind of ["deferred", "failed", "retry-failed"] as const) {
    const line = pushUnregisterLog(kind);
    assert.match(line, /^\[push\] /);
    assert.equal(line.toLowerCase().includes("skipped"), false);
    assert.equal(line.includes("@"), false);
    assert.equal(line.toLowerCase().includes("token["), false);
  }
});
