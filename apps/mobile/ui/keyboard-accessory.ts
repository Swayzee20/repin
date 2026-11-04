/**
 * Which action the iOS keyboard bar should run for the focused field.
 * Number pads have no Return key, so Next on the bar moves to the next field.
 * Multiline fields and the last numeric field show Done, which dismisses.
 * A blur resets the bar on a short delay so the bar button can still read the
 * field that was focused when the tap started.
 */

export type AccessoryLabel = "Done" | "Next";

export type AccessoryCommand = {
  context?: string;
  label: AccessoryLabel;
  onDown?: () => void;
  onUp?: () => void;
  run: () => void;
};

const fallbackRun = () => {};
const fallback: AccessoryCommand = { label: "Done", run: fallbackRun };

let command: AccessoryCommand = fallback;
let generation = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function accessoryLabelFor(returnKeyType: string | undefined): AccessoryLabel {
  return returnKeyType === "next" ? "Next" : "Done";
}

export function keyboardAccessorySnapshot(): AccessoryCommand {
  return command;
}

export function subscribeKeyboardAccessory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function setKeyboardAccessory(next: AccessoryCommand) {
  generation += 1;
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  command = next;
  emit();
  return generation;
}

export function scheduleKeyboardAccessoryReset(fromGeneration: number, delayMs = 100) {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    resetTimer = null;
    if (generation !== fromGeneration) return;
    command = fallback;
    emit();
  }, delayMs);
}

/** Runs the focused field's action. A following blur will not undo a newer focus. */
export function runKeyboardAccessory() {
  const current = command;
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  current.run();
}

export function resetKeyboardAccessoryForTests() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
  generation = 0;
  command = fallback;
}
