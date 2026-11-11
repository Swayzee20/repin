const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const HOSTED_HOST_RE =
  /supabase\.(co|com)|pooler\.supabase|neon\.tech|rds\.amazonaws\.com|amazonaws\.com|azure\.com|cloudsql|timescaledb\.cloud/i;

function hostnameOf(connectionString) {
  const url = new URL(connectionString);
  return (url.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
}

/** Refuse DROP/CREATE unless DATABASE_URL points at a local loopback Postgres. */
export function assertLocalDatabaseUrl(connectionString) {
  let host;
  try {
    host = hostnameOf(connectionString);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid URL; refusing destructive test bootstrap",
    );
  }

  if (!host) {
    throw new Error("DATABASE_URL has no host; refusing destructive test bootstrap");
  }
  if (HOSTED_HOST_RE.test(host)) {
    throw new Error(
      `Refusing to drop/create databases on hosted host ${host}`,
    );
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Refusing to drop/create databases on non-loopback host ${host}; ` +
        "use localhost, 127.0.0.1, or ::1",
    );
  }
}
