import { listBlockedUsersForMember } from "@repin/db";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const blockedUsers = await listBlockedUsersForMember(user.id);
    return NextResponse.json(
      {
        blockedUsers: blockedUsers.map((blockedUser) => ({
          ...blockedUser,
          blockedAt: blockedUser.blockedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Blocked accounts could not be loaded", error);
    return NextResponse.json({ error: "Blocked accounts could not be loaded" }, { status: 503 });
  }
}
