import type { HealthResponse } from "@repin/types";
import { healthResponseSchema } from "@repin/validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const health = healthResponseSchema.parse({
    status: "ok",
    timestamp: new Date().toISOString(),
  }) satisfies HealthResponse;

  return NextResponse.json(health, {
    headers: { "Cache-Control": "no-store" },
  });
}

