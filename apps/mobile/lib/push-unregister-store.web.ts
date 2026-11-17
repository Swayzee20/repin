import { PENDING_PUSH_UNREGISTER_KEY } from "./push-unregister";

let memoryPendingUnregister: string | null = null;

export async function readPendingPushUnregisterToken() {
  if (memoryPendingUnregister) return memoryPendingUnregister;
  try {
    const stored = await Promise.resolve(
      globalThis.localStorage?.getItem(PENDING_PUSH_UNREGISTER_KEY) ?? null,
    );
    memoryPendingUnregister = stored || null;
    return memoryPendingUnregister;
  } catch {
    return memoryPendingUnregister;
  }
}

export async function writePendingPushUnregisterToken(token: string) {
  memoryPendingUnregister = token;
  try {
    await Promise.resolve(globalThis.localStorage?.setItem(PENDING_PUSH_UNREGISTER_KEY, token));
  } catch {
    // Keep the in-memory token so this session still retries.
  }
}

export async function clearPendingPushUnregisterToken() {
  memoryPendingUnregister = null;
  try {
    await Promise.resolve(globalThis.localStorage?.removeItem(PENDING_PUSH_UNREGISTER_KEY));
  } catch {
    // Memory is already cleared.
  }
}
