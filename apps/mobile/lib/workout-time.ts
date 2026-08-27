export function validateTimeParts(minutesInput: string, secondsInput: string) {
  const minutesText = minutesInput.trim();
  const secondsText = secondsInput.trim();
  if (!minutesText && !secondsText) return null;
  if (minutesText && !/^\d+$/.test(minutesText)) return "Minutes must be a non-negative whole number.";
  if (secondsText && !/^\d+$/.test(secondsText)) return "Seconds must be between 0 and 59.";
  const minutes = minutesText ? Number(minutesText) : 0;
  const seconds = secondsText ? Number(secondsText) : 0;
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "Minutes must be a non-negative whole number.";
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) return "Seconds must be between 0 and 59.";
  if (minutes === 0 && seconds === 0) return "Time must be greater than zero.";
  return null;
}

export function getDurationSeconds(minutesInput: string, secondsInput: string) {
  if (!minutesInput.trim() && !secondsInput.trim()) return null;
  return Number(minutesInput.trim() || 0) * 60 + Number(secondsInput.trim() || 0);
}
