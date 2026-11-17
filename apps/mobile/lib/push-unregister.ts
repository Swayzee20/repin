export const PENDING_PUSH_UNREGISTER_KEY = "repin.push.pendingUnregister";

export function resolvePushUnregisterToken(cachedToken: string | null, pendingToken: string | null) {
  return cachedToken ?? pendingToken;
}

export function pushUnregisterLog(kind: "deferred" | "failed" | "retry-failed") {
  if (kind === "deferred") return "[push] token removal deferred";
  if (kind === "failed") return "[push] token removal failed; will retry";
  return "[push] token removal retry failed";
}
