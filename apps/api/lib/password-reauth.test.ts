import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  assertRecentPasswordReauth,
  hasRecentPasswordAmr,
  PASSWORD_REAUTH_WINDOW_MS,
  PasswordReauthError,
  passwordReauthStatus,
} from "./password-reauth";
import { readDeletePassword } from "./delete-account";

const now = Date.UTC(2026, 10, 14, 19, 0, 0);

function passwordAmr(timestampSeconds: number) {
  return [{ method: "password", timestamp: timestampSeconds }];
}

test("password reauth accepts a live password check and never returns the password", async () => {
  const seen: string[] = [];
  await assertRecentPasswordReauth({
    email: "ada@example.com",
    amr: [],
    password: "secret-pass",
    now,
    verifyPassword: (_email, password) => {
      seen.push(password);
      return Promise.resolve(true);
    },
  });
  assert.deepEqual(seen, ["secret-pass"]);
});

test("wrong password is 403 with wrong_password and does not mention the password", async () => {
  await assert.rejects(
    () => assertRecentPasswordReauth({
      email: "ada@example.com",
      amr: passwordAmr(now / 1000),
      password: "nope",
      now,
      verifyPassword: () => Promise.resolve(false),
    }),
    (error: unknown) => {
      assert.ok(error instanceof PasswordReauthError);
      assert.equal(error.code, "wrong");
      assert.equal(error.message, "Wrong password. Try again.");
      assert.equal(error.message.toLowerCase().includes("nope"), false);
      const status = passwordReauthStatus(error);
      assert.equal(status.status, 403);
      assert.deepEqual(status.body, {
        error: "Wrong password. Try again.",
        code: "wrong_password",
      });
      return true;
    },
  );
});

test("missing password without a recent amr is 403 password_reauth_required", async () => {
  await assert.rejects(
    () => assertRecentPasswordReauth({
      email: "ada@example.com",
      amr: [],
      password: undefined,
      now,
      verifyPassword: () => Promise.resolve(true),
    }),
    (error: unknown) => {
      assert.ok(error instanceof PasswordReauthError);
      assert.equal(error.code, "missing");
      const status = passwordReauthStatus(error);
      assert.equal(status.status, 403);
      assert.equal(status.body.code, "password_reauth_required");
      return true;
    },
  );
});

test("stale password amr outside the 5 minute window is rejected", async () => {
  const stale = (now - PASSWORD_REAUTH_WINDOW_MS - 1) / 1000;
  assert.equal(hasRecentPasswordAmr(passwordAmr(stale), now), false);
  await assert.rejects(
    () => assertRecentPasswordReauth({
      email: "ada@example.com",
      amr: passwordAmr(stale),
      password: "",
      now,
      verifyPassword: () => Promise.resolve(true),
    }),
    (error: unknown) => {
      assert.ok(error instanceof PasswordReauthError);
      assert.equal(error.code, "stale");
      assert.equal(passwordReauthStatus(error).body.code, "password_reauth_required");
      return true;
    },
  );
});

test("a password amr within 5 minutes is accepted without a new password", async () => {
  const fresh = (now - 60_000) / 1000;
  assert.equal(hasRecentPasswordAmr(passwordAmr(fresh), now), true);
  await assertRecentPasswordReauth({
    email: "ada@example.com",
    amr: passwordAmr(fresh),
    password: undefined,
    now,
    verifyPassword: () => Promise.reject(new Error("should not verify")),
  });
});

test("readDeletePassword only returns a string password and ignores other fields", () => {
  assert.equal(readDeletePassword({ password: "ok" }), "ok");
  assert.equal(readDeletePassword({ password: 12 }), undefined);
  assert.equal(readDeletePassword(null), undefined);
  assert.equal(readDeletePassword(["secret"]), undefined);
});
