import { adminSignInSchema } from "@repin/validation";
import { NextResponse } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  adminSessionCookieOptions,
  isAdminUserId,
} from "../../../../lib/admin-auth";
import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import { getSupabaseAuthClient } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const input = adminSignInSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ error: "Couldn't sign in. Check your email and password." }, { status: 401 });
    }

    const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword({
      email: input.data.email,
      password: input.data.password,
    });
    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: "Couldn't sign in. Check your email and password." }, { status: 401 });
    }
    if (!isAdminUserId(data.user.id)) {
      return notFound();
    }

    const response = NextResponse.json(
      { email: data.user.email ?? input.data.email },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      ADMIN_ACCESS_COOKIE,
      data.session.access_token,
      adminSessionCookieOptions(data.session.expires_in),
    );
    response.cookies.set(
      ADMIN_REFRESH_COOKIE,
      data.session.refresh_token,
      adminSessionCookieOptions(60 * 60 * 24 * 7),
    );
    return response;
  } catch (error) {
    reportUnexpectedRouteError("Admin session could not be created", error);
    return NextResponse.json({ error: "Couldn't sign in. Check your email and password." }, { status: 503 });
  }
}

export function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_ACCESS_COOKIE, "", adminSessionCookieOptions(0));
  response.cookies.set(ADMIN_REFRESH_COOKIE, "", adminSessionCookieOptions(0));
  return response;
}
