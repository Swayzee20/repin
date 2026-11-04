import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  dueState,
  formatAge,
  handleAdminReportAction,
  type ReviewContentReportFn,
} from "./admin-review";

const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const reportId = "33333333-3333-4333-8333-333333333333";

function reviewMock(calls: Array<{ actorId: string; reportId: string; action: string }>): ReviewContentReportFn {
  return (input) => {
    calls.push(input);
    return Promise.resolve({ ok: true, action: input.action });
  };
}

test("non-admin review requests are 404", async () => {
  const calls: Array<{ actorId: string; reportId: string; action: string }> = [];
  const result = await handleAdminReportAction(
    { userId: otherId, reportId, body: { action: "keep" }, adminUserIds: adminId },
    reviewMock(calls),
  );
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: "Not found" });
  assert.deepEqual(calls, []);
});

test("a signed-out review request is 404", async () => {
  const result = await handleAdminReportAction(
    { userId: null, reportId, body: { action: "remove" }, adminUserIds: adminId },
    reviewMock([]),
  );
  assert.equal(result.status, 404);
});

test("empty or whitespace ADMIN_USER_IDS rejects even a matching user id", async () => {
  for (const adminUserIds of ["", "   ", ",", " , "]) {
    const result = await handleAdminReportAction(
      { userId: adminId, reportId, body: { action: "keep" }, adminUserIds },
      reviewMock([]),
    );
    assert.equal(result.status, 404, adminUserIds);
  }
});

test("an admin can remove, keep, and restore", async () => {
  for (const action of ["remove", "keep", "restore"] as const) {
    const calls: Array<{ actorId: string; reportId: string; action: string }> = [];
    const result = await handleAdminReportAction(
      { userId: adminId, reportId, body: { action }, adminUserIds: ` ${adminId} ` },
      reviewMock(calls),
    );
    assert.deepEqual(result, { status: 200, body: { ok: true, action } });
    assert.deepEqual(calls, [{ actorId: adminId, reportId, action }]);
  }
});

test("an unknown review action is rejected without touching the report", async () => {
  const calls: Array<{ actorId: string; reportId: string; action: string }> = [];
  const result = await handleAdminReportAction(
    { userId: adminId, reportId, body: { action: "delete" }, adminUserIds: adminId },
    reviewMock(calls),
  );
  assert.equal(result.status, 400);
  assert.deepEqual(calls, []);
});

test("a missing report is 404", async () => {
  const result = await handleAdminReportAction(
    { userId: adminId, reportId, body: { action: "keep" }, adminUserIds: adminId },
    () => Promise.resolve({ ok: false, reason: "not_found" }),
  );
  assert.equal(result.status, 404);
});

test("due times use 24 hours from the first report", () => {
  const first = new Date("2026-11-02T12:00:00.000Z");
  assert.deepEqual(dueState(first, new Date("2026-11-02T12:18:00.000Z")), {
    label: "Due in 23 h",
    tone: "muted",
  });
  assert.deepEqual(dueState(first, new Date("2026-11-03T10:30:00.000Z")), {
    label: "Due in 1 h",
    tone: "danger",
  });
  assert.deepEqual(dueState(first, new Date("2026-11-03T13:00:00.000Z")), {
    label: "Overdue",
    tone: "danger",
  });
});

test("queue ages use minutes, then hours", () => {
  const first = new Date("2026-11-02T12:00:00.000Z");
  assert.equal(formatAge(first, new Date("2026-11-02T12:18:00.000Z")), "18 min ago");
  assert.equal(formatAge(first, new Date("2026-11-02T14:00:00.000Z")), "2 h ago");
  assert.equal(formatAge(first, new Date("2026-11-02T12:00:30.000Z")), "just now");
});
