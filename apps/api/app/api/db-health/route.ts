import { checkDatabaseConnection } from "@repin/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await checkDatabaseConnection();

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Database health check failed", error);

    return NextResponse.json(
      { status: "error" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

