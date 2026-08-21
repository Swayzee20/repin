import { getGroupPreviewByInviteCode } from "@repin/db";
import { inviteCodeSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const user = await requireApplicationUser(request);
    const { code } = await context.params;
    const inviteCode = inviteCodeSchema.safeParse(code);

    if (!inviteCode.success) {
      return NextResponse.json(
        { error: "Invite code is invalid or expired" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const group = await getGroupPreviewByInviteCode({
      userId: user.id,
      inviteCode: inviteCode.data,
    });

    if (!group) {
      return NextResponse.json(
        { error: "Invite code is invalid or expired" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { group },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Invite code could not be checked", error);
    return NextResponse.json(
      { error: "Invite code could not be checked" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
