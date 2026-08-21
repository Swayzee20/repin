const inviteCodePattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeInviteCode(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const normalized = rawValue.trim().toUpperCase();
  return inviteCodePattern.test(normalized) ? normalized : null;
}

export function invitePath(inviteCode: string) {
  return `/join/${encodeURIComponent(inviteCode)}` as const;
}

export function normalizeInviteRedirect(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const match = /^\/join\/([^/?#]+)$/i.exec(rawValue.trim());
  if (!match?.[1]) return null;

  try {
    const inviteCode = normalizeInviteCode(decodeURIComponent(match[1]));
    return inviteCode ? invitePath(inviteCode) : null;
  } catch {
    return null;
  }
}
