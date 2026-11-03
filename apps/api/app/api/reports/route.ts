import { createContentReportForMember } from "@repin/db";
import { createContentReportSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = createContentReportSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Report details are invalid", issues: input.error.issues },
        { status: 400 },
      );
    }

    const created = await createContentReportForMember({
      userId: user.id,
      targetType: input.data.targetType,
      targetId: input.data.targetId,
      reason: input.data.reason,
      details: input.data.details,
      alsoBlock: input.data.alsoBlock,
    });
    if (!created.ok) {
      if (created.reason === "own_content") {
        return NextResponse.json({ error: "You can't report your own content" }, { status: 403 });
      }
      if (created.reason === "invalid") {
        return NextResponse.json({ error: "Add a few words so we can look into it." }, { status: 400 });
      }
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        blocked: created.blocked === true,
        report: {
          id: created.report.id,
          reason: created.report.reason,
          status: created.report.status,
          targetId: created.report.targetId,
          targetType: created.report.targetType,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Report could not be saved", error);
    return NextResponse.json(
      { error: "Couldn't send. Check your connection and try again." },
      { status: 503 },
    );
  }
}
