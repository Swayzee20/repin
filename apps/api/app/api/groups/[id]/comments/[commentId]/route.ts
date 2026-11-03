import { deleteCommunityCommentForMember } from "@repin/db";
import { groupIdSchema, uuidSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { id, commentId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const parsedCommentId = uuidSchema.safeParse(commentId);
    if (!groupId.success || !parsedCommentId.success) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const deleted = await deleteCommunityCommentForMember({
      userId: user.id,
      groupId: groupId.data,
      commentId: parsedCommentId.data,
    });
    if (!deleted) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    return NextResponse.json(
      { deletedBy: deleted.deletedBy },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Comment could not be deleted", error);
    return NextResponse.json({ error: "Comment could not be deleted" }, { status: 503 });
  }
}
