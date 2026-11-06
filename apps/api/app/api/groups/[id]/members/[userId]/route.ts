import { removeCrewMember } from "@repin/db";
import { groupIdSchema, uuidSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import { handleCrewMutationError } from "../../../../../../lib/crew-route";
import { requireApplicationUser } from "../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const user = await requireApplicationUser(request);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.id);
    const memberId = uuidSchema.safeParse(params.userId);
    if (!groupId.success || !memberId.success) {
      return NextResponse.json({ error: "Invalid member" }, { status: 400 });
    }

    const removed = await removeCrewMember({
      userId: user.id,
      groupId: groupId.data,
      memberId: memberId.data,
    });
    if (!removed) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    return NextResponse.json(
      removed,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Member could not be removed");
  }
}
