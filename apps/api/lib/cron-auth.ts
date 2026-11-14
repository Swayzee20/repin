import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function authorizeCronRequest(
  secret: string | undefined,
  authorization: string | null | undefined,
) {
  if (!secret) return false;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return timingSafeEqual(sha256(token), sha256(secret));
}
