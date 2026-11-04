import { cookies } from "next/headers";

import { isAdminUserId } from "./admin-ids";
import { setApiSentryUser } from "./sentry";
import {
  AuthenticationError,
  ensureApplicationUser,
  verifyAccessToken,
} from "./supabase-auth";

export { canAccessAdmin, isAdminUserId, parseAdminUserIds } from "./admin-ids";

export const ADMIN_ACCESS_COOKIE = "repin_admin_access";
export const ADMIN_REFRESH_COOKIE = "repin_admin_refresh";

export class AdminAccessError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    try {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    } catch {
      return trimmed.slice(name.length + 1);
    }
  }
  return null;
}

export function readAdminAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return readCookieValue(request.headers.get("cookie"), ADMIN_ACCESS_COOKIE);
}

export function adminSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function requireAdminUser(request: Request) {
  const token = readAdminAccessToken(request);
  if (!token) throw new AdminAccessError();

  let identity: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    identity = await verifyAccessToken(token);
  } catch (error) {
    if (error instanceof AuthenticationError) throw new AdminAccessError();
    throw error;
  }

  if (!isAdminUserId(identity.id)) throw new AdminAccessError();
  setApiSentryUser(identity.id);
  return ensureApplicationUser(identity);
}

export async function getAdminPageSession() {
  const token = (await cookies()).get(ADMIN_ACCESS_COOKIE)?.value?.trim();
  if (!token) return null;
  try {
    const identity = await verifyAccessToken(token);
    return { id: identity.id, email: identity.email };
  } catch {
    return null;
  }
}
