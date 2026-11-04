export function parseAdminUserIds(value: string | undefined | null) {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminUserId(
  userId: string | null | undefined,
  value = process.env.ADMIN_USER_IDS,
) {
  if (!userId) return false;
  return parseAdminUserIds(value).includes(userId);
}

export function canAccessAdmin(
  userId: string | null | undefined,
  value = process.env.ADMIN_USER_IDS,
) {
  return isAdminUserId(userId, value);
}
