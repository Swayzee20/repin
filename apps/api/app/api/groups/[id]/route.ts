import { getGroupForMember } from "@repin/db";
import { groupIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const groupId = groupIdSchema.safeParse(id);

    if (!groupId.success) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const group = await getGroupForMember({
      groupId: groupId.data,
      userId: user.id,
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json(
      { group },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Group could not be loaded", error);
    return NextResponse.json(
      { error: "Group could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
