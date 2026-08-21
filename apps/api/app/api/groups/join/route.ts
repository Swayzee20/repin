import { joinGroupByInviteCode } from "@repin/db";
import { joinGroupByInviteCodeSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = joinGroupByInviteCodeSchema.safeParse(body);

    if (!input.success) {
      return NextResponse.json(
        { error: "Enter a valid 8-character invite code" },
        { status: 400 },
      );
    }

    const result = await joinGroupByInviteCode({
      userId: user.id,
      inviteCode: input.data.inviteCode,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Invite code is invalid" },
        { status: 404 },
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

    console.error("Group could not be joined by invite code", error);
    return NextResponse.json(
      { error: "Group could not be joined" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
