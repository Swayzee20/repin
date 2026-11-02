import { unblockUserForMember } from "@repin/db";
import { uuidSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { userId } = await context.params;
    const blockedUserId = uuidSchema.safeParse(userId);
    if (!blockedUserId.success) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    await unblockUserForMember({
      blockerId: user.id,
      blockedId: blockedUserId.data,
    });
    return NextResponse.json(
      { unblockedUserId: blockedUserId.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Person could not be unblocked", error);
    return NextResponse.json({ error: "Person could not be unblocked" }, { status: 503 });
  }
}
