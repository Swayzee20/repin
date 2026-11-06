import { CrewRequestError } from "@repin/db";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "./sentry";
import { AuthenticationError } from "./supabase-auth";

export function handleCrewMutationError(error: unknown, fallback: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof CrewRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode, headers: { "Cache-Control": "no-store" } },
    );
  }
  reportUnexpectedRouteError(fallback, error);
  return NextResponse.json(
    { error: fallback },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
