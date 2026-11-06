import AsyncStorage from "expo-sqlite/kv-store";

const dismissedKey = "push-preprompt-dismissed";

let memoryDismissed = false;

export async function wasPushPrepromptDismissed() {
  if (memoryDismissed) return true;
  try {
    const value = await AsyncStorage.getItemAsync(dismissedKey);
    memoryDismissed = value === "1";
    return memoryDismissed;
  } catch {
    return memoryDismissed;
  }
}

export async function markPushPrepromptDismissed() {
  memoryDismissed = true;
  try {
    await AsyncStorage.setItemAsync(dismissedKey, "1");
  } catch {
    // Keep the in-memory flag so this session still does not nag.
  }
}
