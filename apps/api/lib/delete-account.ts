import type { AccountDeletionResult, AccountDeletionStoragePlan } from "@repin/db";

import {
  assertRecentPasswordReauth,
  PasswordReauthError,
} from "./password-reauth";

export async function runAccountDeletion(input: {
  userId: string;
  email: string;
  amr: unknown;
  password: string | undefined;
  now?: number;
  verifyPassword: (email: string, password: string) => Promise<boolean>;
  prepareStorage: (userId: string) => Promise<AccountDeletionStoragePlan>;
  deleteUserPhotos: (userId: string, retain: Set<string>) => Promise<void>;
  deleteAccount: (userId: string) => Promise<AccountDeletionResult>;
  deleteClosedCrewStorage: (
    groupIds: string[],
    extraPaths: string[],
    retain: Set<string>,
  ) => Promise<void>;
  notifyNewOwners: (transfers: Array<{ groupId: string; newOwnerId: string }>) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
}) {
  await assertRecentPasswordReauth({
    email: input.email,
    amr: input.amr,
    password: input.password,
    now: input.now,
    verifyPassword: input.verifyPassword,
  });

  const plan = await input.prepareStorage(input.userId);
  const retain = new Set(plan.protectedMediaPaths);
  await input.deleteUserPhotos(input.userId, retain);
  const result = await input.deleteAccount(input.userId);
  await input.deleteClosedCrewStorage(
    result.deletedGroupIds,
    plan.closedCrewPhotoPaths,
    retain,
  );
  if (result.deletedUser && result.transferredGroups.length) {
    await input.notifyNewOwners(result.transferredGroups);
  }
  await input.deleteAuthUser(input.userId);
  return result;
}

export function readDeletePassword(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const password = (body as { password?: unknown }).password;
  return typeof password === "string" ? password : undefined;
}

export { PasswordReauthError };
