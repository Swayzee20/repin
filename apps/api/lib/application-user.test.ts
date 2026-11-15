import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  provisionApplicationUser,
  registerPushTokenForExistingUser,
  unregisterPushTokenForExistingUser,
} from "./application-user";

const userId = "11111111-1111-4111-8111-111111111111";
const token = "ExponentPushToken[test]";

test("DELETE /api/push/token for a user with no profile does not create one", async () => {
  let removed = 0;
  const result = await unregisterPushTokenForExistingUser({
    userId,
    expoPushToken: token,
    findUser: () => Promise.resolve(null),
    removeToken: () => {
      removed += 1;
      return Promise.resolve();
    },
  });
  assert.deepEqual(result, { removed: true, created: false });
  assert.equal(removed, 0);
});

test("DELETE /api/push/token removes a token for an existing profile without creating another", async () => {
  const removed: Array<{ userId: string; expoPushToken: string }> = [];
  const result = await unregisterPushTokenForExistingUser({
    userId,
    expoPushToken: token,
    findUser: (id) => Promise.resolve({ id, displayName: "Ada" }),
    removeToken: (input) => {
      removed.push(input);
      return Promise.resolve();
    },
  });
  assert.deepEqual(result, { removed: true, created: false });
  assert.deepEqual(removed, [{ userId, expoPushToken: token }]);
});

test("POST /api/push/token without a profile is 401 and creates nothing", async () => {
  let upserted = 0;
  const result = await registerPushTokenForExistingUser({
    userId,
    expoPushToken: token,
    platform: "ios",
    supportsPostTargets: true,
    findUser: () => Promise.resolve(null),
    upsertToken: () => {
      upserted += 1;
      return Promise.resolve();
    },
  });
  assert.deepEqual(result, { ok: false, status: 401, created: false });
  assert.equal(upserted, 0);
});

test("normal sign-in still creates a profile once", async () => {
  const users = new Map<string, { id: string; displayName: string }>();
  let creates = 0;
  let authChecks = 0;

  const provision = () => provisionApplicationUser({
    id: userId,
    displayName: "Ada",
    findUser: (id) => Promise.resolve(users.get(id) ?? null),
    createUser: (input) => {
      creates += 1;
      const created = { id: input.id, displayName: input.displayName };
      users.set(input.id, created);
      return Promise.resolve(created);
    },
    authUserExists: () => {
      authChecks += 1;
      return Promise.resolve(true);
    },
  });

  const first = await provision();
  const second = await provision();
  assert.deepEqual(first, { id: userId, displayName: "Ada" });
  assert.equal(second, first);
  assert.equal(creates, 1);
  assert.equal(authChecks, 1);
  assert.equal(users.size, 1);
});

test("push token routes look up an existing profile and never auto-create", () => {
  const route = readFileSync(new URL("../app/api/push/token/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /findApplicationUser/);
  assert.match(route, /unregisterPushTokenForExistingUser/);
  assert.match(route, /registerPushTokenForExistingUser/);
  assert.equal(route.includes("requireApplicationUser"), false);
  assert.equal(route.includes("ensureApplicationUser"), false);
  assert.equal(route.includes("getOrCreateUser"), false);
});

test("a deleted auth user does not get a new profile", async () => {
  let creates = 0;
  const user = await provisionApplicationUser({
    id: userId,
    displayName: "Ghost",
    findUser: () => Promise.resolve(null),
    createUser: (input) => {
      creates += 1;
      return Promise.resolve(input);
    },
    authUserExists: () => Promise.resolve(false),
  });
  assert.equal(user, null);
  assert.equal(creates, 0);
});
