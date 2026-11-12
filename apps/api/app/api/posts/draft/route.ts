import { createGeneralPublicationDraft } from "@repin/db";
import { NextResponse } from "next/server";

import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const draft = await createGeneralPublicationDraft({ authorId: user.id });
    return NextResponse.json(
      { publicationId: draft.id },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    reportUnexpectedRouteError("Draft could not be created", error);
    return NextResponse.json(
      { error: "Draft could not be created" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
