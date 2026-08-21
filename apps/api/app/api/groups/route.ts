import { createGroup, listGroupsForUser } from "@repin/db";
import { createGroupSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  requireApplicationUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const groups = await listGroupsForUser(user.id);

    return NextResponse.json(
      { groups },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Groups could not be loaded");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = createGroupSchema.safeParse(body);

    if (!input.success) {
      return NextResponse.json(
        { error: "Group name must be between 1 and 80 characters" },
        { status: 400 },
      );
    }

    const group = await createGroup({ ownerId: user.id, name: input.data.name });

    return NextResponse.json(
      { group },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return handleRouteError(error, "Group could not be created");
  }
}

function handleRouteError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(message, error);
  return NextResponse.json(
    { error: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

