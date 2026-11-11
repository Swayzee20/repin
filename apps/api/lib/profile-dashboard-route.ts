import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "./sentry";

export function handleDashboardRouteError(error: unknown, message: string) {
  if (isAuthenticationError(error)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (isDashboardRequestError(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode, headers: { "Cache-Control": "no-store" } },
    );
  }
  reportUnexpectedRouteError(message, error);
  return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function isAuthenticationError(error: unknown) {
  return error instanceof Error && error.name === "AuthenticationError";
}

function isDashboardRequestError(
  error: unknown,
): error is { message: string; statusCode: number } {
  if (!error || typeof error !== "object") return false;
  if (!("statusCode" in error) || !("message" in error)) return false;
  return typeof error.statusCode === "number" && typeof error.message === "string";
}
