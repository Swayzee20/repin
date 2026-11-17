export const PASSWORD_REAUTH_WINDOW_MS = 5 * 60 * 1000;

export type PasswordReauthCode = "wrong" | "missing" | "stale";

export class PasswordReauthError extends Error {
  readonly code: PasswordReauthCode;

  constructor(code: PasswordReauthCode) {
    super(
      code === "wrong"
        ? "Wrong password. Try again."
        : "Password required",
    );
    this.name = "PasswordReauthError";
    this.code = code;
  }
}

function readAmrTimestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 1e12 ? value : value * 1000;
}

export function hasRecentPasswordAmr(amr: unknown, now = Date.now()) {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as { method?: unknown; timestamp?: unknown };
    if (record.method !== "password") return false;
    const timestamp = readAmrTimestamp(record.timestamp);
    if (timestamp == null) return false;
    const age = now - timestamp;
    return age >= 0 && age <= PASSWORD_REAUTH_WINDOW_MS;
  });
}

export async function assertRecentPasswordReauth(input: {
  email: string;
  amr: unknown;
  password: string | undefined;
  now?: number;
  verifyPassword: (email: string, password: string) => Promise<boolean>;
}) {
  const password = input.password?.length ? input.password : undefined;
  if (password) {
    const email = input.email.trim();
    if (!email) throw new PasswordReauthError("missing");
    const ok = await input.verifyPassword(email, password);
    if (!ok) throw new PasswordReauthError("wrong");
    return;
  }

  if (hasRecentPasswordAmr(input.amr, input.now ?? Date.now())) return;
  if (Array.isArray(input.amr) && input.amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return (entry as { method?: unknown }).method === "password";
  })) {
    throw new PasswordReauthError("stale");
  }
  throw new PasswordReauthError("missing");
}

export function passwordReauthStatus(error: PasswordReauthError) {
  return {
    status: 403 as const,
    body: {
      error: error.message,
      code: error.code === "wrong" ? "wrong_password" : "password_reauth_required",
    },
  };
}
