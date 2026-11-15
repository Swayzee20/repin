export async function signOutAfterAccountDeleted(input: {
  accessToken: string;
  unregisterPushToken: (accessToken: string | null | undefined) => Promise<void>;
  signOut: () => Promise<unknown>;
}) {
  await input.unregisterPushToken(input.accessToken);
  await input.signOut();
}
