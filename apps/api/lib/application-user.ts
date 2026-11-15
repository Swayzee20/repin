export type ApplicationUserRecord = {
  id: string;
  displayName: string;
};

export async function provisionApplicationUser<T extends ApplicationUserRecord>(input: {
  id: string;
  displayName: string;
  findUser: (id: string) => Promise<T | null>;
  createUser: (input: { id: string; displayName: string }) => Promise<T>;
  authUserExists: (id: string) => Promise<boolean | null>;
}): Promise<T | null> {
  const existing = await input.findUser(input.id);
  if (existing) return existing;
  const authUserExists = await input.authUserExists(input.id);
  if (authUserExists === false) return null;
  return input.createUser({
    id: input.id,
    displayName: input.displayName,
  });
}

export async function unregisterPushTokenForExistingUser(input: {
  userId: string;
  expoPushToken: string;
  findUser: (id: string) => Promise<ApplicationUserRecord | null>;
  removeToken: (input: { userId: string; expoPushToken: string }) => Promise<unknown>;
}) {
  const user = await input.findUser(input.userId);
  if (!user) {
    return { removed: true as const, created: false as const };
  }
  await input.removeToken({
    userId: user.id,
    expoPushToken: input.expoPushToken,
  });
  return { removed: true as const, created: false as const };
}

export async function registerPushTokenForExistingUser(input: {
  userId: string;
  expoPushToken: string;
  platform: "ios" | "android" | "web";
  supportsPostTargets?: boolean;
  findUser: (id: string) => Promise<ApplicationUserRecord | null>;
  upsertToken: (input: {
    userId: string;
    expoPushToken: string;
    platform: "ios" | "android" | "web";
    supportsPostTargets?: boolean;
  }) => Promise<unknown>;
}): Promise<
  | { ok: true; created: false }
  | { ok: false; status: 401; created: false }
> {
  const user = await input.findUser(input.userId);
  if (!user) {
    return { ok: false, status: 401, created: false };
  }
  await input.upsertToken({
    userId: user.id,
    expoPushToken: input.expoPushToken,
    platform: input.platform,
    supportsPostTargets: input.supportsPostTargets,
  });
  return { ok: true, created: false };
}
