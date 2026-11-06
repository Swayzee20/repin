import { leaveCrew } from "@repin/db";
import { groupIdSchema } from "@repin/validation";
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

    const left = await leaveCrew({
      userId: user.id,
      groupId: groupId.data,
    });
    if (!left) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    return NextResponse.json(
      left,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Could not leave the crew");
  }
}
