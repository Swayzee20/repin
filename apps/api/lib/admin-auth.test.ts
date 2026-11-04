import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { canAccessAdmin, isAdminUserId, parseAdminUserIds } from "./admin-ids";

const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

test("empty or whitespace ADMIN_USER_IDS means nobody is admin", () => {
  for (const value of [undefined, "", "   ", "\n\t", ",,,", " , , "]) {
    assert.deepEqual(parseAdminUserIds(value), []);
    assert.equal(isAdminUserId(adminId, value), false);
    assert.equal(canAccessAdmin(adminId, value), false);
  }
});

test("admin user ids are trimmed from a comma-separated list", () => {
  const value = ` ${adminId} , ${otherId} `;
  assert.deepEqual(parseAdminUserIds(value), [adminId, otherId]);
  assert.equal(isAdminUserId(adminId, value), true);
  assert.equal(isAdminUserId(otherId, value), true);
  assert.equal(isAdminUserId("33333333-3333-4333-8333-333333333333", value), false);
});

test("a missing user id is never an admin", () => {
  assert.equal(isAdminUserId(null, adminId), false);
  assert.equal(isAdminUserId(undefined, adminId), false);
  assert.equal(isAdminUserId("", adminId), false);
  assert.equal(canAccessAdmin(null, adminId), false);
});
