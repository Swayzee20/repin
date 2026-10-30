import type { SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

export const PASSWORD_RESET_SENT_MESSAGE =
  "If an account exists for that email, we sent a link to reset your password.";

export const INVALID_RESET_LINK_MESSAGE =
  "This reset link is invalid or has expired.";

const PASSWORD_MIN_LENGTH = 8;

export type RecoveryLink = {
  code?: string;
  tokenHash?: string;
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
  errorDescription?: string;
};

export type RecoverySessionResult =
  | { ok: true; established: "link" | "existing" }
  | { ok: false; message: string };

type PasswordResetError = {
  message?: string;
  code?: string;
  status?: number;
} | null;

const recoveryAttempts = new Map<string, Promise<RecoverySessionResult>>();

export function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordValidationMessage(password: string, confirmation: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 8 characters.";
  }
  if (password !== confirmation) {
    return "Passwords do not match.";
  }
  return null;
}

export function getPasswordResetRedirectUrl() {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return "/reset-password";
    return `${window.location.origin}/reset-password`;
  }

  // Linking.createURL uses the repin scheme. An empty host can come out as
  // repin:///reset-password; Supabase allow-lists repin://reset-password.
  return Linking.createURL("reset-password").replace(
    /^([a-z][a-z0-9+.-]*):\/\/\/+/i,
    "$1://",
  );
}

export function readRecoveryLink(url: string): RecoveryLink {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
  const queryParams = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);
  const pick = (key: string) => queryValue(queryParams.get(key)) || queryValue(hashParams.get(key));

  return {
    code: pick("code"),
    tokenHash: pick("token_hash") || pick("token"),
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    type: pick("type"),
    error: pick("error") || pick("error_code"),
    errorDescription: pick("error_description"),
  };
}

export function recoveryLinkFromSources(input: {
  url: string | null;
  searchParams?: Record<string, string | string[] | undefined>;
}): RecoveryLink {
  const fromUrl = input.url ? readRecoveryLink(input.url) : {};
  const search = input.searchParams ?? {};
  const pick = (key: string, current?: string) => current || queryValue(search[key]);

  return {
    code: pick("code", fromUrl.code),
    tokenHash: fromUrl.tokenHash || queryValue(search.token_hash) || queryValue(search.token),
    accessToken: pick("access_token", fromUrl.accessToken),
    refreshToken: pick("refresh_token", fromUrl.refreshToken),
    type: pick("type", fromUrl.type),
    error: fromUrl.error || queryValue(search.error) || queryValue(search.error_code),
    errorDescription: fromUrl.errorDescription || queryValue(search.error_description),
  };
}

export function hasRecoveryMaterial(link: RecoveryLink) {
  return Boolean(
    link.error
    || link.code
    || link.tokenHash
    || (link.accessToken && link.refreshToken),
  );
}

export function passwordResetFeedback(error: PasswordResetError) {
  if (!error) {
    return { kind: "success" as const, message: PASSWORD_RESET_SENT_MESSAGE };
  }

  const message = error.message?.toLowerCase() ?? "";
  const code = error.code?.toLowerCase() ?? "";
  const status = error.status ?? 0;
  if (
    status >= 500
    || code === "unexpected_failure"
    || message.includes("fetch")
    || message.includes("network")
    || message.includes("timeout")
  ) {
    return {
      kind: "error" as const,
      message: "We couldn't send the reset email. Check your connection and try again.",
    };
  }
  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return {
      kind: "error" as const,
      message: "Too many requests. Wait a moment and try again.",
    };
  }

  // Unknown auth responses, including "user not found", use the same success
  // copy so the screen does not reveal which emails have accounts.
  return { kind: "success" as const, message: PASSWORD_RESET_SENT_MESSAGE };
}

export async function requestPasswordReset(client: SupabaseClient, email: string) {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    return passwordResetFeedback(error);
  } catch {
    return passwordResetFeedback({ message: "network", status: 503 });
  }
}

export function establishRecoverySession(client: SupabaseClient, link: RecoveryLink) {
  const key = recoveryAttemptKey(link);
  if (!key) return finishWithoutRecoveryParams(client);

  const existing = recoveryAttempts.get(key);
  if (existing) return existing;

  const attempt = runRecovery(client, link);
  recoveryAttempts.set(key, attempt);
  return attempt;
}

export function clearRecoveryAddressBar() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const path = window.location.pathname || "/reset-password";
  window.history.replaceState(null, "", path);
}

function queryValue(value: string | string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function recoveryAttemptKey(link: RecoveryLink) {
  if (link.error) return `error:${link.error}`;
  if (link.code) return `code:${link.code}`;
  if (link.tokenHash) return `token:${link.tokenHash}`;
  if (link.accessToken && link.refreshToken) return `session:${link.accessToken}`;
  return null;
}

function isRecoveryType(type: string | undefined) {
  return !type || type === "recovery";
}

async function runRecovery(client: SupabaseClient, link: RecoveryLink): Promise<RecoverySessionResult> {
  try {
    if (link.error) return { ok: false, message: INVALID_RESET_LINK_MESSAGE };

    if (link.code) {
      const { error } = await client.auth.exchangeCodeForSession(link.code);
      return error
        ? { ok: false, message: INVALID_RESET_LINK_MESSAGE }
        : { ok: true, established: "link" };
    }

    if (link.tokenHash) {
      if (!isRecoveryType(link.type)) return { ok: false, message: INVALID_RESET_LINK_MESSAGE };
      const { error } = await client.auth.verifyOtp({
        token_hash: link.tokenHash,
        type: "recovery",
      });
      return error
        ? { ok: false, message: INVALID_RESET_LINK_MESSAGE }
        : { ok: true, established: "link" };
    }

    if (link.accessToken && link.refreshToken) {
      if (!isRecoveryType(link.type)) return { ok: false, message: INVALID_RESET_LINK_MESSAGE };
      const { error } = await client.auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      return error
        ? { ok: false, message: INVALID_RESET_LINK_MESSAGE }
        : { ok: true, established: "link" };
    }

    return finishWithoutRecoveryParams(client);
  } catch {
    return { ok: false, message: INVALID_RESET_LINK_MESSAGE };
  }
}

async function finishWithoutRecoveryParams(client: SupabaseClient): Promise<RecoverySessionResult> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return { ok: false, message: INVALID_RESET_LINK_MESSAGE };
    return { ok: true, established: "existing" };
  } catch {
    return { ok: false, message: INVALID_RESET_LINK_MESSAGE };
  }
}
