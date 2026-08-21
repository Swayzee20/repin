import { searchGroupsForUser } from "@repin/db";
import { groupSearchQuerySchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const url = new URL(request.url);
    const input = groupSearchQuerySchema.safeParse({ q: url.searchParams.get("q") });

    if (!input.success) {
      return NextResponse.json(
        { error: "Enter at least 2 characters to search" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const groups = await searchGroupsForUser({
      userId: user.id,
      query: input.data.q,
      limit: 10,
    });

    return NextResponse.json(
      { groups },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Groups could not be searched", error);
    return NextResponse.json(
      { error: "Groups could not be searched" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
