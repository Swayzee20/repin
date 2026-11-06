import { removeDevicePushToken, upsertDevicePushToken } from "@repin/db";
import {
  registerPushTokenSchema,
  unregisterPushTokenSchema,
} from "@repin/validation";
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
    const body: unknown = await request.json().catch(() => null);
    const input = registerPushTokenSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Push token is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await upsertDevicePushToken({
      userId: user.id,
      expoPushToken: input.data.expoPushToken,
      platform: input.data.platform,
    });

    return NextResponse.json(
      { registered: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Push token could not be saved");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApplicationUser(request);
    const body: unknown = await request.json().catch(() => null);
    const input = unregisterPushTokenSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "Push token is invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await removeDevicePushToken({
      userId: user.id,
      expoPushToken: input.data.expoPushToken,
    });

    return NextResponse.json(
      { removed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error, "Push token could not be removed");
  }
}

function handleRouteError(error: unknown, message: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  reportUnexpectedRouteError(message, error);
  return NextResponse.json(
    { error: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
