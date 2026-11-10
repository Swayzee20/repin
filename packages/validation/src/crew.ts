import { z } from "zod";

export const crewAlertTypes = [
  "crew_workout",
  "crew_comment",
  "crew_reaction",
] as const;

export type CrewAlertType = (typeof crewAlertTypes)[number];

export type CrewNotificationPrefs = {
  muteAll: boolean;
  crewWorkout: boolean;
  crewComment: boolean;
  crewReaction: boolean;
};

export const defaultCrewNotificationPrefs: CrewNotificationPrefs = {
  muteAll: false,
  crewWorkout: true,
  crewComment: true,
  crewReaction: true,
};

const dayMs = 24 * 60 * 60 * 1_000;

/** Device-local Sunday 00:00 through next Sunday 00:00 (exclusive). */
export function sundayWeekBounds(now: Date, timezoneOffsetMinutes: number) {
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const daysSinceSunday = local.getUTCDay();
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const todayStart = localMidnightUtc + timezoneOffsetMinutes * 60_000;
  const weekStart = new Date(todayStart - daysSinceSunday * dayMs);
  const weekEnd = new Date(weekStart.getTime() + 7 * dayMs);
  return { weekStart, weekEnd };
}

export function isInSundayWeek(
  value: Date,
  now: Date,
  timezoneOffsetMinutes: number,
) {
  const { weekStart, weekEnd } = sundayWeekBounds(now, timezoneOffsetMinutes);
  return value >= weekStart && value < weekEnd;
}

export function resolveCrewNotificationPrefs(
  rows: Array<{ alertType: string; enabled: boolean }>,
): CrewNotificationPrefs {
  const byType = new Map(rows.map((row) => [row.alertType, row.enabled]));
  return {
    muteAll: byType.get("mute_all") ?? false,
    crewWorkout: byType.get("crew_workout") ?? true,
    crewComment: byType.get("crew_comment") ?? true,
    crewReaction: byType.get("crew_reaction") ?? true,
  };
}

export function notificationSummary(prefs: CrewNotificationPrefs) {
  if (prefs.muteAll) return "Muted";
  const offCount = [
    prefs.crewWorkout,
    prefs.crewComment,
    prefs.crewReaction,
  ].filter((enabled) => !enabled).length;
  if (offCount === 0) return "All on";
  return `${offCount} off`;
}

export function crewAlertAllowed(
  prefs: CrewNotificationPrefs,
  alertType: CrewAlertType,
) {
  if (prefs.muteAll) return false;
  if (alertType === "crew_workout") return prefs.crewWorkout;
  if (alertType === "crew_comment") return prefs.crewComment;
  return prefs.crewReaction;
}

export function crewPagePermissions(input: {
  role: "owner" | "member";
  memberCount: number;
}) {
  const isOwner = input.role === "owner";
  const hasOthers = input.memberCount > 1;
  return {
    canRename: isOwner,
    canEditPhoto: isOwner,
    canResetInvite: isOwner,
    canTransfer: isOwner && hasOthers,
    canRemoveMembers: isOwner && hasOthers,
    canLeave: !isOwner || !hasOthers,
    ownerMustTransferToLeave: isOwner && hasOthers,
    showSoloLeaveHelper: isOwner && !hasOthers,
    canCopyInvite: true,
    canShareInvite: true,
  };
}

export const updateCrewSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    photoPath: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.name === undefined && value.photoPath === undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide a crew name or photo",
      });
    }
  });

export const transferCrewSchema = z
  .object({
    userId: z.uuid(),
  })
  .strict();

export const crewNotificationPrefsSchema = z
  .object({
    muteAll: z.boolean(),
    crewWorkout: z.boolean(),
    crewComment: z.boolean(),
    crewReaction: z.boolean(),
  })
  .strict();

export const crewPageQuerySchema = z.object({
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

export const crewPhotoPathPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/].+$/i;

export function isCrewPhotoPathForGroup(photoPath: string, groupId: string) {
  return (
    crewPhotoPathPattern.test(photoPath)
    && !photoPath.includes("..")
    && photoPath.toLowerCase().startsWith(`${groupId.toLowerCase()}/`)
  );
}

export const crewMarkLetters = ["M", "S", "R", "B", "F"] as const;

export function crewMarkTiles(name: string) {
  const letter = Array.from(name.trim())[0]?.toLocaleUpperCase() || "C";
  const tiles = [letter, ...crewMarkLetters.filter((mark) => mark !== letter)];
  return tiles.slice(0, 5);
}

export function formatWorkoutsThisWeek(count: number) {
  return `${count} workout${count === 1 ? "" : "s"} this week`;
}

export function formatMemberCount(count: number) {
  return `${count} member${count === 1 ? "" : "s"}`;
}

export function formatCreatedLabel(createdAt: Date | string) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const stamped = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `Created ${stamped}`;
}

export function firstNameForToast(displayName: string) {
  const cleaned = displayName.trim().replace(/\s+/g, " ");
  return cleaned.split(" ")[0] || "Member";
}

export const crewCopy = {
  removeTitle: "Remove member",
  removeBody: (name: string) =>
    `Remove ${name} from the crew? Their posts will be hidden from the crew, and they can rejoin only with a new invite.`,
  transferTitle: "Transfer ownership",
  transferBody: (name: string) =>
    `Make ${name} the owner? You’ll become a regular member. Only one owner at a time.`,
  resetTitle: "Reset invite code",
  resetBody:
    "Reset the invite code? The old code stops working right away. Anyone with it will need the new one.",
  leaveTitle: "Leave crew",
  leaveMemberBody: (crewName: string) =>
    `Leave ${crewName}? You’ll lose access until someone invites you again.`,
  leaveOwnerBlockedBody:
    "You’re the owner. Transfer ownership to someone else before you leave.",
  soloLeaveHelper:
    "You’re the only member. Leave removes you and closes this empty crew.",
  notificationsIntro:
    "Pick what you hear from this crew. You’ll still see everything when you open it.",
  privacyHelper: "Crews are private. Only people with the invite code can join.",
  toastCopied: "Code copied",
  toastReset: "Code reset",
  toastRemoved: (name: string) => `${name} removed`,
} as const;
