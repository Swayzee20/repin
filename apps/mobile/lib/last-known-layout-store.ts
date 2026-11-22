import AsyncStorage from "expo-sqlite/kv-store";

import {
  lastKnownLayoutKey,
  parseLastKnownLayout,
  type LastKnownLayout,
} from "./last-known-layout";

export {
  emptyLastKnownLayout,
  lastKnownLayoutKey,
  parseLastKnownLayout,
  type LastKnownLayout,
} from "./last-known-layout";

const memory = new Map<string, LastKnownLayout>();

export async function readLastKnownLayout(userId: string): Promise<LastKnownLayout | null> {
  const cached = memory.get(userId);
  if (cached) return cached;
  try {
    const stored = parseLastKnownLayout(await AsyncStorage.getItemAsync(lastKnownLayoutKey(userId)));
    if (stored) memory.set(userId, stored);
    return stored;
  } catch {
    return memory.get(userId) ?? null;
  }
}

export async function writeLastKnownLayout(userId: string, value: LastKnownLayout): Promise<void> {
  memory.set(userId, value);
  try {
    await AsyncStorage.setItemAsync(lastKnownLayoutKey(userId), JSON.stringify(value));
  } catch {
    // Keep the in-memory snapshot so this session still matches.
  }
}

export async function clearLastKnownLayout(userId: string): Promise<void> {
  memory.delete(userId);
  try {
    await AsyncStorage.removeItemAsync(lastKnownLayoutKey(userId));
  } catch {
    // Memory is already empty for this user.
  }
}

export function clearLastKnownLayoutMemoryForTests() {
  memory.clear();
}
