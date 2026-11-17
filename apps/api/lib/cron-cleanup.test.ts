import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { authorizeCronRequest } from "./cron-auth";
import { handleCronCleanupRequest } from "./cron-cleanup";

const secret = "cron-test-secret";

function failCleanup() {
  return Promise.reject(new Error("cleanup must not run"));
}

function failPhotos() {
  return Promise.reject(new Error("photos must not run"));
}

test("cron auth refuses every call when the secret is unset", async () => {
  assert.equal(authorizeCronRequest(undefined, "Bearer cron-test-secret"), false);
  assert.equal(authorizeCronRequest("", "Bearer cron-test-secret"), false);
  const result = await handleCronCleanupRequest({
    authorization: "Bearer cron-test-secret",
    secret: undefined,
    cleanup: failCleanup,
    deletePhotos: failPhotos,
  });
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
});

test("cron auth refuses a wrong bearer token", async () => {
  assert.equal(authorizeCronRequest(secret, "Bearer other"), false);
  const result = await handleCronCleanupRequest({
    authorization: "Bearer other",
    secret,
    cleanup: failCleanup,
    deletePhotos: failPhotos,
  });
  assert.equal(result.status, 401);
});

test("cron auth accepts the matching bearer and returns 200", async () => {
  assert.equal(authorizeCronRequest(secret, `Bearer ${secret}`), true);
  const photos: string[][] = [];
  const result = await handleCronCleanupRequest({
    authorization: `Bearer ${secret}`,
    secret,
    cleanup: () => Promise.resolve({
      deletedCount: 2,
      mediaPathsToDelete: ["a.jpg", "b.jpg"],
    }),
    deletePhotos: (paths) => {
      photos.push(paths);
      return Promise.resolve();
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    deletedEvidence: 2,
    photosRemoved: 2,
  });
  assert.deepEqual(photos, [["a.jpg", "b.jpg"]]);
});
