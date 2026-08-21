import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);

    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    console.error("Authenticated user request failed", error);
    return NextResponse.json(
      { error: "User service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
