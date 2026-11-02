import {
  createContentReportForMember,
  listOpenReportsForGroupOwner,
} from "@repin/db";
import { createContentReportSchema, groupIdSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const groupId = await readGroupId(context);
    if (!groupId) return NextResponse.json({ error: "Reports are not available" }, { status: 404 });

    const reports = await listOpenReportsForGroupOwner({
      userId: user.id,
      groupId,
    });
    if (!reports) {
      return NextResponse.json(
        { error: "Reports are not available" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        reports: reports.map((report) => ({
          ...report,
          createdAt: report.createdAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Reports could not be loaded");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApplicationUser(request);
    const groupId = await readGroupId(context);
    if (!groupId) return NextResponse.json({ error: "Content not found" }, { status: 404 });

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
      groupId,
      targetType: input.data.targetType,
      workoutSessionId: input.data.targetType === "post" ? input.data.workoutSessionId : undefined,
      commentId: input.data.targetType === "comment" ? input.data.commentId : undefined,
      reason: input.data.reason,
      note: input.data.note,
    });

    if (!created.ok) {
      if (created.reason === "own_content") {
        return NextResponse.json(
          { error: "You can't report your own content" },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        report: {
          id: created.report.id,
          targetType: created.report.targetType,
          targetId: created.report.targetId,
          reason: created.report.reason,
          status: created.report.status,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Report could not be saved");
  }
}

async function readGroupId(context: RouteContext) {
  const { id } = await context.params;
  const groupId = groupIdSchema.safeParse(id);
  return groupId.success ? groupId.data : null;
}

function routeError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 503 });
}
