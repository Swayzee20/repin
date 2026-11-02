import { blockUserForMember, listBlockedUsersForMember } from "@repin/db";
import { blockUserSchema } from "@repin/validation";
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
    return routeError(error, "Blocked users could not be loaded");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = blockUserSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Block request is invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const blocked = await blockUserForMember({
      blockerId: user.id,
      blockedId: input.data.blockedUserId,
    });
    if (!blocked.ok && blocked.reason === "self") {
      return NextResponse.json({ error: "You can't block yourself" }, { status: 400 });
    }
    if (!blocked.ok) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json(
      { blockedUserId: input.data.blockedUserId },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Person could not be blocked");
  }
}

function routeError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 503 });
}
