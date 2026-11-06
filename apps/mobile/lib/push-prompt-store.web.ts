import {
  dismissedStorageKey,
  isDismissedFromStoredValues,
  legacyDismissedStorageKey,
} from "./push-prompt-policy";

const memoryDismissed = new Map<string, boolean>();

function memoryKey(userId?: string | null) {
  return userId ?? "";
}

export async function wasPushPrepromptDismissed(userId?: string | null) {
  const key = memoryKey(userId);
  if (memoryDismissed.get(key)) return true;
  try {
    const perUser = userId
      ? await Promise.resolve(globalThis.localStorage?.getItem(dismissedStorageKey(userId)) ?? null)
      : null;
    const legacy = await Promise.resolve(
      globalThis.localStorage?.getItem(legacyDismissedStorageKey) ?? null,
    );
    const dismissed = isDismissedFromStoredValues(perUser, legacy);
    memoryDismissed.set(key, dismissed);
    return dismissed;
  } catch {
    return memoryDismissed.get(key) === true;
  }
}

export async function markPushPrepromptDismissed(userId?: string | null) {
  const key = memoryKey(userId);
  memoryDismissed.set(key, true);
  try {
    await Promise.resolve(globalThis.localStorage?.setItem(dismissedStorageKey(userId), "1"));
  } catch {
    // Keep the in-memory flag so this session still does not nag.
  }
}

export function clearPushPrepromptMemoryForTests() {
  memoryDismissed.clear();
}
