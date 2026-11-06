import { transferCrewOwnership } from "@repin/db";
import { groupIdSchema, transferCrewSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleCrewMutationError } from "../../../../../lib/crew-route";
import { requireApplicationUser } from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApplicationUser(request);
    const { id } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    if (!groupId.success) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const body: unknown = await request.json().catch(() => null);
    const input = transferCrewSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ error: "Pick a member to make owner" }, { status: 400 });
    }

    const transferred = await transferCrewOwnership({
      userId: user.id,
      groupId: groupId.data,
      newOwnerId: input.data.userId,
    });
    if (!transferred) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    return NextResponse.json(
      transferred,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Ownership could not be transferred");
  }
}
