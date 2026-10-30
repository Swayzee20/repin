import "server-only";

import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const adminKey = secretKey || serviceRoleKey;
  const keySource: "secret" | "service_role" | null = secretKey
    ? "secret"
    : serviceRoleKey
      ? "service_role"
      : null;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !adminKey) {
    throw new Error(
      "Supabase admin access requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (adminKey === publishableKey || adminKey.startsWith("sb_publishable_")) {
    throw new Error(
      "Supabase admin access is configured with a publishable key instead of a server secret",
    );
  }

  return {
    client: createClient(supabaseUrl, adminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }),
    keySource,
  };
}
