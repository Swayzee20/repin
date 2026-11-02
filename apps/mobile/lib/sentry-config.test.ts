import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  redactSecrets,
  resolveMobileRelease,
  resolveMobileSentryConfig,
  resolveMobileSourceMapUpload,
  resolveSentryEnvironment,
  scrubSentryEvent,
  sentryTestActionVisible,
  sentryUserFromId,
} from "./sentry-config";

test("a missing DSN disables the SDK and sends nothing", () => {
  for (const dsn of [undefined, "", "   "]) {
    const config = resolveMobileSentryConfig({ dsn, dev: true, platform: "ios" });
    assert.equal(config.enabled, false);
    assert.equal(config.dsn, undefined);
    assert.equal(config.sendDefaultPii, false);
    assert.equal(config.tracesSampleRate, 0);
    assert.equal(config.enableNative, false);
  }
});

test("a DSN enables error reporting without tracing, replay, or PII", () => {
  const config = resolveMobileSentryConfig({
    dsn: " https://public@o.ingest.sentry.io/1 ",
    dev: false,
    easBuildProfile: "production",
    platform: "ios",
    appVersion: "1.0.0",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.dsn, "https://public@o.ingest.sentry.io/1");
  assert.equal(config.environment, "production");
  assert.equal(config.sendDefaultPii, false);
  assert.equal(config.tracesSampleRate, 0);
  assert.equal(config.release, undefined);
  assert.equal(config.showTestAction, false);
  assert.equal(config.enableNative, true);
});

test("environment prefers the EAS profile, then Vercel, then dev", () => {
  assert.equal(resolveSentryEnvironment({ dev: false, easBuildProfile: "preview", vercelEnv: "production" }), "preview");
  assert.equal(resolveSentryEnvironment({ dev: false, vercelEnv: "preview", nodeEnv: "production" }), "preview");
  assert.equal(resolveSentryEnvironment({ dev: true, nodeEnv: "production" }), "development");
  assert.equal(resolveSentryEnvironment({ dev: false, nodeEnv: "production" }), "production");
});

test("the test action is gated off production builds", () => {
  assert.equal(sentryTestActionVisible({ dev: true, environment: "production" }), true);
  assert.equal(sentryTestActionVisible({ dev: false, environment: "preview" }), true);
  assert.equal(sentryTestActionVisible({ dev: false, environment: "development" }), true);
  assert.equal(sentryTestActionVisible({ dev: false, environment: "production" }), false);
});

test("web release uses the app version and native release stays with the SDK", () => {
  assert.deepEqual(resolveMobileRelease({ platform: "web", appVersion: "1.0.0", gitSha: "abcdef1234567890" }), {
    release: "repin@1.0.0",
    dist: "abcdef123456",
  });
  assert.deepEqual(resolveMobileRelease({ platform: "ios", appVersion: "1.0.0", gitSha: "abcdef" }), {
    release: undefined,
    dist: undefined,
  });
});

test("Expo Go does not enable the native SDK", () => {
  const config = resolveMobileSentryConfig({
    dsn: "https://public@o.ingest.sentry.io/1",
    dev: true,
    platform: "ios",
    expoGo: true,
  });
  assert.equal(config.enabled, true);
  assert.equal(config.enableNative, false);
});

test("source map upload is skipped unless org, project, and token are all set", () => {
  const missing = resolveMobileSourceMapUpload({ org: "repin", project: "mobile" });
  assert.equal(missing.disableAutoUpload, true);
  assert.equal("authToken" in missing, false);
  const ready = resolveMobileSourceMapUpload({
    org: "repin",
    project: "repin-mobile",
    authToken: "sntrys_secret",
  });
  assert.equal(ready.disableAutoUpload, false);
  assert.equal(ready.organization, "repin");
  assert.equal(ready.project, "repin-mobile");
  assert.equal("authToken" in ready, false);
});

test("the Sentry user is only the Supabase id", () => {
  assert.deepEqual(sentryUserFromId(" user-1 "), { id: "user-1" });
  assert.equal(sentryUserFromId("ada@example.com"), null);
  assert.equal(sentryUserFromId("  "), null);
  assert.equal(sentryUserFromId(null), null);
});

test("events drop bodies, auth, cookies, emails, and workout content", () => {
  const event = scrubSentryEvent({
    message: "failed for ada@example.com",
    user: { id: "user-1", email: "ada@example.com", username: "Ada", ip_address: "1.1.1.1" },
    request: {
      method: "POST",
      url: "https://repin.example/api/workouts?title=Easy+run",
      headers: {
        Authorization: "Bearer secret-token",
        Cookie: "sb=session",
        "Content-Type": "application/json",
      },
      cookies: { sb: "session" },
      data: { title: "Easy run", notes: "felt good" },
      query_string: "title=Easy+run",
    },
    extra: { comment: "nice work", workout: { title: "Easy run" }, status: 503 },
    contexts: { device: { name: "Ada's iPhone", model: "iPhone18,1" } },
    breadcrumbs: [
      { message: "commented ada@example.com", data: { url: "/api/home?q=run", body: "secret" } },
    ],
    exception: { values: [{ type: "Error", value: "Bearer abc.def.ghi and ada@example.com" }] },
  });

  assert.equal(event.message, "failed for [Filtered]");
  assert.deepEqual(event.user, { id: "user-1" });
  assert.equal(event.request?.url, "https://repin.example/api/workouts");
  assert.equal(event.request?.data, undefined);
  assert.equal(event.request?.cookies, undefined);
  assert.equal(event.request?.query_string, undefined);
  assert.deepEqual(event.request?.headers, { "Content-Type": "application/json" });
  assert.deepEqual(event.extra, { status: 503 });
  assert.deepEqual(event.contexts, { device: { model: "iPhone18,1" } });
  assert.equal(event.breadcrumbs?.[0]?.message, "commented [Filtered]");
  assert.deepEqual(event.breadcrumbs?.[0]?.data, { url: "/api/home" });
  assert.equal(event.exception?.values?.[0]?.value, "Bearer [Filtered] and [Filtered]");
  assert.equal(event.exception?.values?.[0]?.type, "Error");
});

test("redactSecrets leaves ordinary errors intact", () => {
  assert.equal(redactSecrets("Home data could not be loaded"), "Home data could not be loaded");
});
