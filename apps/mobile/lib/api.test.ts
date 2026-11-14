import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { apiErrorMessage, apiRequest } from "./api";

/* eslint-disable @typescript-eslint/no-floating-promises */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("non-OK with no usable body uses Request failed and the status code", () => {
  assert.equal(apiErrorMessage(404, null), "Request failed (404)");
  assert.equal(apiErrorMessage(500, {}), "Request failed (500)");
  assert.equal(apiErrorMessage(401, { error: "   " }), "Request failed (401)");
});

test("a server-provided JSON error message is preserved without the status fallback", () => {
  assert.equal(apiErrorMessage(404, { error: "Crew not found" }), "Crew not found");
  assert.equal(apiErrorMessage(400, { error: "Pick at least one crew." }), "Pick at least one crew.");
});

test("apiRequest throws Request failed with the status when the body has no message", async () => {
  globalThis.fetch = () => Promise.resolve(new Response("", { status: 404 }));

  await assert.rejects(
    () => apiRequest("/api/missing", "token"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Request failed (404)");
      assert.equal((error as Error & { status?: number }).status, 404);
      return true;
    },
  );
});

test("apiRequest keeps the JSON error message on a non-OK response", async () => {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "Crew not found", code: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

  await assert.rejects(
    () => apiRequest("/api/crews", "token"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Crew not found");
      assert.equal((error as Error & { status?: number; code?: string }).status, 404);
      assert.equal((error as Error & { status?: number; code?: string }).code, "not_found");
      return true;
    },
  );
});

test("apiRequest leaves network failures unchanged", async () => {
  const boom = new TypeError("Failed to fetch");
  globalThis.fetch = () => Promise.reject(boom);

  await assert.rejects(
    () => apiRequest("/api/home", "token"),
    (error: unknown) => {
      assert.equal(error, boom);
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "Failed to fetch");
      return true;
    },
  );
});
