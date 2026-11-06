const dismissedKey = "push-preprompt-dismissed";

let memoryDismissed = false;

export async function wasPushPrepromptDismissed() {
  if (memoryDismissed) return true;
  try {
    memoryDismissed = await Promise.resolve(
      globalThis.localStorage?.getItem(dismissedKey) === "1",
    );
    return memoryDismissed;
  } catch {
    return memoryDismissed;
  }
}

export async function markPushPrepromptDismissed() {
  memoryDismissed = true;
  try {
    await Promise.resolve(globalThis.localStorage?.setItem(dismissedKey, "1"));
  } catch {
    // Keep the in-memory flag so this session still does not nag.
  }
}
