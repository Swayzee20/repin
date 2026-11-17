import AsyncStorage from "expo-sqlite/kv-store";

import { PENDING_PUSH_UNREGISTER_KEY } from "./push-unregister";

let memoryPendingUnregister: string | null = null;

export async function readPendingPushUnregisterToken() {
  if (memoryPendingUnregister) return memoryPendingUnregister;
  try {
    const stored = await AsyncStorage.getItemAsync(PENDING_PUSH_UNREGISTER_KEY);
    memoryPendingUnregister = stored || null;
    return memoryPendingUnregister;
  } catch {
    return memoryPendingUnregister;
  }
}

export async function writePendingPushUnregisterToken(token: string) {
  memoryPendingUnregister = token;
  try {
    await AsyncStorage.setItemAsync(PENDING_PUSH_UNREGISTER_KEY, token);
  } catch {
    // Keep the in-memory token so this session still retries.
  }
}

export async function clearPendingPushUnregisterToken() {
  memoryPendingUnregister = null;
  try {
    await AsyncStorage.removeItemAsync(PENDING_PUSH_UNREGISTER_KEY);
  } catch {
    // Memory is already cleared.
  }
}
