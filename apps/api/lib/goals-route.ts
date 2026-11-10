import { GoalRequestError } from "@repin/db";
import { NextResponse } from "next/server";

import { AuthenticationError } from "./supabase-auth";
import { reportUnexpectedRouteError } from "./sentry";

export function handleGoalRouteError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof GoalRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode, headers: { "Cache-Control": "no-store" } },
    );
  }
  reportUnexpectedRouteError(message, error);
  return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
