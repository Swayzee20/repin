import "server-only";

import { getOrCreateUser } from "@repin/db";
import { resolveUserDisplayName } from "@repin/types";
import { createClient } from "@supabase/supabase-js";

import type { ServerTiming } from "./server-timing";

export class AuthenticationError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthenticationError";
  }
}

function getAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase Auth is not configured");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const startsWithBearer = authorization?.startsWith("Bearer ") ?? false;
  const token = startsWithBearer
    ? (authorization?.slice("Bearer ".length).trim() ?? "")
    : "";

  console.info("[Supabase bearer diagnostic]", {
    authorizationHeaderExists: authorization !== null,
    startsWithBearer,
    tokenNonEmpty: token.length > 0,
  });

  if (!startsWithBearer) {
    throw new AuthenticationError();
  }

  if (!token) {
    throw new AuthenticationError();
  }

  return token;
}

function readMetadataString(metadata: unknown, key: string) {
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getSuggestedDisplayName(claims: Record<string, unknown>) {
  const metadata = claims.user_metadata;
  const metadataName =
    readMetadataString(metadata, "display_name") ??
    readMetadataString(metadata, "full_name") ??
    readMetadataString(metadata, "name");

  return resolveUserDisplayName({
    firstName: readMetadataString(metadata, "first_name"),
    lastName: readMetadataString(metadata, "last_name"),
    displayName: metadataName,
    email: typeof claims.email === "string" ? claims.email : undefined,
  });
}

export async function requireAuthenticatedUser(
  request: Request,
  timing?: ServerTiming,
) {
  const authenticate = async () => {
    const token = readBearerToken(request);
    const { data, error } = await getAuthClient().auth.getClaims(token);

    console.info("[Supabase verification diagnostic]", {
      error: error?.message ?? null,
      status: error?.status ?? null,
    });

    if (error || !data?.claims.sub) {
      throw new AuthenticationError();
    }

    return {
      id: data.claims.sub,
      suggestedDisplayName: getSuggestedDisplayName(data.claims),
    };
  };

  return timing ? timing.measure("auth", authenticate) : authenticate();
}

export function ensureApplicationUser(
  identity: Awaited<ReturnType<typeof requireAuthenticatedUser>>,
  timing?: ServerTiming,
) {
  const resolveUser = () => getOrCreateUser({
    id: identity.id,
    displayName: identity.suggestedDisplayName,
  });

  return timing ? timing.measure("user", resolveUser) : resolveUser();
}

export async function requireApplicationUser(
  request: Request,
  timing?: ServerTiming,
) {
  const identity = await requireAuthenticatedUser(request, timing);
  return ensureApplicationUser(identity, timing);
}
