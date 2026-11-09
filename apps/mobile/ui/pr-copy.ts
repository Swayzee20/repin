export const prCopy = {
  promptTitle: "Is this a PR?",
  promptOneRepIntro:
    "We only ask once for a new 1-rep lift. Saying no still saves it as your baseline.",
  promptForTimeIntro: (workoutName: string) =>
    `No earlier ${workoutName} time on file. If this is your first, mark it so we can track next ones.`,
  promptPrimary: "Yes, it's a PR",
  promptSecondary: "Not a PR",
  celebrationTitle: (count: number) => (count === 1 ? "New PR" : `${count} new PRs`),
  celebrationHelper: "Just for you. Share next if you want your crew to see it.",
  autoChip: "Auto-detected",
  personalRecordChip: "Personal record",
  shareTitle: (crewName: string) => `Share with ${crewName}?`,
  shareBody:
    "Adds a PR badge to the post you just logged. Keeps the same post — no new post, and nobody gets a notification.",
  sharePrimary: "Share",
  shareSecondary: "Not now",
  shareHelper: "You can remove the badge later from the post.",
  shareFailed: "Could not share that PR.",
  noPostHelper: "Saved privately. This workout isn't on a crew feed, so there's nothing to share yet.",
  noPostPrimary: "Done",
  continue: "Continue",
  unshare: "Remove PR badge",
  toast: "PR badge removed",
  toastUndo: "Undo",
  overflow: (count: number) => `+${count}`,
} as const;

export function prCelebrationAnnouncement(summary: string) {
  return `New personal record: ${summary}`;
}
