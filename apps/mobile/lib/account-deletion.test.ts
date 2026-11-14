import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { signOutAfterAccountDeleted } from "./account-deletion";

test("account deletion unregisters the push token before signing out", async () => {
  const calls: string[] = [];
  await signOutAfterAccountDeleted({
    accessToken: "access-token",
    unregisterPushToken: (token) => {
      calls.push(`unregister:${token ?? ""}`);
      return Promise.resolve();
    },
    signOut: () => {
      calls.push("signOut");
      return Promise.resolve();
    },
  });
  assert.deepEqual(calls, ["unregister:access-token", "signOut"]);
});

test("settings finishes a successful delete with push cleanup before sign-out", () => {
  const settings = readFileSync(new URL("../app/settings.tsx", import.meta.url), "utf8");
  const start = settings.indexOf("const deleteAccount");
  const end = settings.indexOf("return (", start);
  assert.ok(start >= 0, "deleteAccount missing");
  assert.ok(end > start, "deleteAccount body missing");
  const body = settings.slice(start, end);
  assert.match(body, /signOutAfterAccountDeleted/);
  assert.match(body, /removePushTokenForSession/);
  assert.ok(body.indexOf("signOutAfterAccountDeleted") < body.indexOf("router.replace"));
  assert.equal(body.includes("await supabase.auth.signOut"), false);
});
