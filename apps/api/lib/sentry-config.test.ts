import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  resolveApiSentryConfig,
  scrubSentryEvent,
  sentryUserFromId,
} from "./sentry-config";

test("a missing DSN disables the API SDK", () => {
  for (const dsn of [undefined, "", "  "]) {
    const config = resolveApiSentryConfig({ dsn, nodeEnv: "development" });
    assert.equal(config.enabled, false);
    assert.equal(config.dsn, undefined);
    assert.equal(config.sendDefaultPii, false);
    assert.equal(config.tracesSampleRate, 0);
    assert.equal(config.sourceMapsUpload, false);
  }
});

test("environment and release come from Vercel when they are present", () => {
  const config = resolveApiSentryConfig({
    dsn: " https://public@o.ingest.sentry.io/2 ",
    vercelEnv: "preview",
    nodeEnv: "production",
    gitSha: "abcdef1234567890",
    version: "0.0.0",
    authToken: "sntrys_secret",
    org: "repin",
    project: "repin-api",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.environment, "preview");
  assert.equal(config.release, "repin-api@abcdef123456");
  assert.equal(config.sourceMapsUpload, true);
  assert.equal(config.org, "repin");
  assert.equal(config.project, "repin-api");
  assert.equal("authToken" in config, false);
});

test("source map upload stays off when any credential is missing", () => {
  const config = resolveApiSentryConfig({
    dsn: "https://public@o.ingest.sentry.io/2",
    nodeEnv: "production",
    org: "repin",
    project: "repin-api",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.environment, "production");
  assert.equal(config.release, "repin-api@0.0.0");
  assert.equal(config.sourceMapsUpload, false);
});

test("the Sentry user is only the Supabase id", () => {
  assert.deepEqual(sentryUserFromId("user-1"), { id: "user-1" });
  assert.equal(sentryUserFromId("ada@example.com"), null);
  assert.equal(sentryUserFromId(null), null);
});

test("API events drop request bodies, auth headers, cookies, and post content", () => {
  const event = scrubSentryEvent({
    user: { id: "user-1", email: "ada@example.com", username: "Ada" },
    request: {
      method: "POST",
      url: "https://api.repin.app/api/groups/1/workouts?note=easy",
      headers: { Authorization: "Bearer secret", Cookie: "sb=1", Accept: "application/json" },
      cookies: { sb: "1" },
      data: { title: "Easy run", comment: "felt good" },
    },
    extra: { post: "hello", code: "503" },
    exception: { values: [{ type: "Error", value: "ada@example.com" }] },
  });

  assert.deepEqual(event.user, { id: "user-1" });
  assert.equal(event.request?.url, "https://api.repin.app/api/groups/1/workouts");
  assert.equal(event.request?.data, undefined);
  assert.equal(event.request?.cookies, undefined);
  assert.deepEqual(event.request?.headers, { Accept: "application/json" });
  assert.deepEqual(event.extra, { code: "503" });
  assert.equal(event.exception?.values?.[0]?.value, "[Filtered]");
});
