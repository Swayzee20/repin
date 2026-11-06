import AsyncStorage from "expo-sqlite/kv-store";

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
      ? await AsyncStorage.getItemAsync(dismissedStorageKey(userId))
      : null;
    const legacy = await AsyncStorage.getItemAsync(legacyDismissedStorageKey);
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
    await AsyncStorage.setItemAsync(dismissedStorageKey(userId), "1");
  } catch {
    // Keep the in-memory flag so this session still does not nag.
  }
}

export function clearPushPrepromptMemoryForTests() {
  memoryDismissed.clear();
}
