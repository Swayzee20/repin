import { blockUserForMember, unblockUserForMember } from "@repin/db";
import { uuidSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const blockedUserId = await readUserId(context);
    if (!blockedUserId) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    const blocked = await blockUserForMember({
      blockerId: user.id,
      blockedId: blockedUserId,
    });
    if (!blocked.ok && blocked.reason === "self") {
      return NextResponse.json({ error: "You can't block yourself" }, { status: 400 });
    }
    if (!blocked.ok) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    return NextResponse.json(
      { blockedUserId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Couldn't block. Check your connection and try again.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const blockedUserId = await readUserId(context);
    if (!blockedUserId) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    await unblockUserForMember({ blockerId: user.id, blockedId: blockedUserId });
    return NextResponse.json(
      { unblockedUserId: blockedUserId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Person could not be unblocked");
  }
}

async function readUserId(context: RouteContext) {
  const { userId } = await context.params;
  const parsed = uuidSchema.safeParse(userId);
  return parsed.success ? parsed.data : null;
}

function routeError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 503 });
}
