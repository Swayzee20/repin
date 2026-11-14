import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  pushUnregisterLog,
  resolvePushUnregisterToken,
} from "./push-unregister";

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

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

test("web pending-unregister storage does not import expo-sqlite", () => {
  const notifications = source("push-notifications.ts");
  const nativeStore = source("push-unregister-store.ts");
  const webStore = source("push-unregister-store.web.ts");
  assert.match(notifications, /from "\.\/push-unregister-store"/);
  assert.equal(notifications.includes("expo-sqlite"), false);
  assert.match(nativeStore, /from "expo-sqlite\/kv-store"/);
  assert.equal(webStore.includes("expo-sqlite"), false);
  assert.match(webStore, /localStorage/);
});
