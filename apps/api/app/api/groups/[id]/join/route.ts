import { joinGroup } from "@repin/db";
import { groupIdSchema, joinGroupByInviteCodeSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";

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
    const inviteCode = joinGroupByInviteCodeSchema.safeParse(body);

    if (!inviteCode.success) {
      return NextResponse.json(
        { error: "A valid invite code is required to join" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await joinGroup({
      userId: user.id,
      groupId: groupId.data,
      inviteCode: inviteCode.data.inviteCode,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Invite code is invalid" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(result, {
      status: result.alreadyMember ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Group could not be joined", error);
    return NextResponse.json(
      { error: "Group could not be joined" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
