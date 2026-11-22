import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  emptyLastKnownLayout,
  lastKnownLayoutKey,
  parseLastKnownLayout,
} from "./last-known-layout";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("last-known layout keys are per user and parse rejects junk", () => {
  assert.equal(lastKnownLayoutKey("user-ada"), "last-known-layout:user-ada");
  assert.notEqual(lastKnownLayoutKey("user-ada"), lastKnownLayoutKey("user-maya"));
  assert.deepEqual(emptyLastKnownLayout(), {
    activityRowCount: 1,
    crewName: null,
    firstName: null,
    highlightsShown: false,
    pinnedPostShown: false,
  });
  assert.equal(parseLastKnownLayout(null), null);
  assert.equal(parseLastKnownLayout("{"), null);
  assert.deepEqual(parseLastKnownLayout(JSON.stringify({
    activityRowCount: 3,
    crewName: "Morning Crew",
    firstName: "Josue",
    highlightsShown: true,
    pinnedPostShown: true,
  })), {
    activityRowCount: 3,
    crewName: "Morning Crew",
    firstName: "Josue",
    highlightsShown: true,
    pinnedPostShown: true,
  });
});

test("Home and Community write the cache after a successful load; Settings clears it on sign-out", () => {
  const store = source("./last-known-layout-store.ts");
  const home = source("../app/(tabs)/(home)/index.tsx");
  const community = source("../app/(tabs)/community/index.tsx");
  const settings = source("../app/settings.tsx");
  assert.match(store, /expo-sqlite\/kv-store/);
  assert.match(store, /lastKnownLayoutKey\(userId\)/);
  assert.match(home, /writeLastKnownLayout\(session\.user\.id/);
  assert.match(community, /writeLastKnownLayout\(auth\.session\.user\.id/);
  assert.equal((settings.match(/clearLastKnownLayout/g) ?? []).length >= 2, true);
  assert.match(settings, /clearLastKnownLayout\(data\.session\.user\.id\)/);
});
