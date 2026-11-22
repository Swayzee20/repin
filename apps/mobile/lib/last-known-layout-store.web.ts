import {
  emptyLastKnownLayout,
  lastKnownLayoutKey,
  parseLastKnownLayout,
  type LastKnownLayout,
} from "./last-known-layout";

export { emptyLastKnownLayout, lastKnownLayoutKey, parseLastKnownLayout };
export type { LastKnownLayout };

const memory = new Map<string, LastKnownLayout>();

export async function readLastKnownLayout(userId: string): Promise<LastKnownLayout | null> {
  const cached = memory.get(userId);
  if (cached) return cached;
  try {
    const stored = parseLastKnownLayout(
      await Promise.resolve(globalThis.localStorage?.getItem(lastKnownLayoutKey(userId)) ?? null),
    );
    if (stored) memory.set(userId, stored);
    return stored;
  } catch {
    return memory.get(userId) ?? null;
  }
}

export async function writeLastKnownLayout(userId: string, value: LastKnownLayout): Promise<void> {
  memory.set(userId, value);
  try {
    await Promise.resolve(
      globalThis.localStorage?.setItem(lastKnownLayoutKey(userId), JSON.stringify(value)),
    );
  } catch {
    // Keep the in-memory snapshot so this session still matches.
  }
}

export async function clearLastKnownLayout(userId: string): Promise<void> {
  memory.delete(userId);
  try {
    await Promise.resolve(globalThis.localStorage?.removeItem(lastKnownLayoutKey(userId)));
  } catch {
    // Memory is already empty for this user.
  }
}

export function clearLastKnownLayoutMemoryForTests() {
  memory.clear();
}
