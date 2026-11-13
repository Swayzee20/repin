/**
 * Push and permission copy. Draft for Josue's sign-off; wording from Quill.
 * Keep every user-facing notification string in this file.
 */

export const pushCopy = {
  prePrompt: {
    title: "Stay in the loop with your crew",
    body: "Get a heads-up when your crew posts a workout, or when someone comments on or reacts to yours. You can adjust this for each crew anytime in Notifications.",
    primary: "Turn on notifications",
    secondary: "Not now",
  },
} as const;

export function newWorkoutPushBody(name: string, crew: string) {
  return `${name} posted a workout in ${crew}. Go cheer them on.`;
}

export function newPostPushTitle(name: string, crew: string) {
  return `${name} posted in ${crew}`;
}

export function firstPostLine(body: string | null | undefined) {
  const line = body?.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return line;
}

export function commentPushBody(name: string) {
  return `${name} commented on your workout.`;
}

/** n is distinct people (never emit "1 people"). */
export function reactionPushBody(name: string, count: number) {
  if (count < 2) return `${name} reacted to your workout.`;
  return `${count} people reacted to your workout.`;
}
