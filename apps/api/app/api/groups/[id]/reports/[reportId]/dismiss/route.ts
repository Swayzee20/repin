import { dismissContentReportForGroupOwner } from "@repin/db";
import { groupIdSchema, uuidSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; reportId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const { id, reportId } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!groupId.success || !parsedReportId.success) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const dismissed = await dismissContentReportForGroupOwner({
      userId: user.id,
      groupId: groupId.data,
      reportId: parsedReportId.data,
    });
    if (!dismissed) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(
      { report: dismissed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Report could not be dismissed", error);
    return NextResponse.json({ error: "Report could not be dismissed" }, { status: 503 });
  }
}
