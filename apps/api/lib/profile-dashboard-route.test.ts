import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { handleDashboardRouteError } from "./profile-dashboard-route";

class DashboardRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DashboardRequestError";
    this.statusCode = statusCode;
  }
}

class AuthenticationError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthenticationError";
  }
}

test("dashboard routes map missing owned workouts to 404 with no payload", async () => {
  const missing = handleDashboardRouteError(
    new DashboardRequestError("Workout not found", 404),
    "Workout could not be loaded",
  );
  assert.equal(missing.status, 404);
  const body = await missing.json();
  assert.deepEqual(body, { error: "Workout not found" });
  assert.equal("workout" in body, false);
});

test("dashboard routes keep unauthenticated callers at 401", async () => {
  const unauthorized = handleDashboardRouteError(new AuthenticationError(), "Workouts could not be loaded");
  assert.equal(unauthorized.status, 401);
  const body = await unauthorized.json();
  assert.equal(body.error, "Unauthorized");
});
