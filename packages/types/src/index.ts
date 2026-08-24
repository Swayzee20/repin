export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface UserDisplayNameInput {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
}

const namePartPattern = /^[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*$/u;

export function resolveUserDisplayName(input: UserDisplayNameInput) {
  const firstName = cleanNameValue(input.firstName);
  const lastName = cleanNameValue(input.lastName);

  if (firstName) {
    return lastName ? `${firstName} ${firstCharacter(lastName).toLocaleUpperCase()}.` : firstName;
  }

  const displayName = cleanNameValue(input.displayName);
  if (displayName) {
    if (displayName === "RepIn member") return displayName;

    const parts = displayName.split(/\s+/);
    if (parts.length >= 2 && parts.every((part) => namePartPattern.test(part))) {
      return `${parts[0]} ${firstCharacter(parts.at(-1) ?? "").toLocaleUpperCase()}.`;
    }

    return displayName;
  }

  const email = cleanNameValue(input.email);
  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "RepIn member";
}

export function getUserInitials(input: UserDisplayNameInput) {
  const displayName = resolveUserDisplayName(input);
  const parts = displayName.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => firstCharacter(part).toLocaleUpperCase()).join("") || "R";
}

function cleanNameValue(value: string | null | undefined) {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned || undefined;
}

function firstCharacter(value: string) {
  return Array.from(value)[0] ?? "";
}

export type GroupRole = "owner" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  role: GroupRole;
  inviteCode?: string;
}

export interface GroupPreview {
  id: string;
  name: string;
  memberCount: number;
  isMember: boolean;
}

export interface JoinGroupResponse {
  group: GroupPreview;
  membership: { role: GroupRole };
  alreadyMember: boolean;
}

export const workoutTypes = [
  "run",
  "walk",
  "strength_training",
  "powerlifting",
  "hiit",
  "functional_fitness",
  "other",
] as const;

export type WorkoutType = (typeof workoutTypes)[number];

export const workoutMetricTypes = [
  "duration",
  "distance",
  "calories",
  "rounds",
  "score",
  "pace",
  "other",
] as const;

export type WorkoutMetricType = (typeof workoutMetricTypes)[number];

export interface QuickLogMetricInput {
  metricType: WorkoutMetricType;
  label?: string | null;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
}

export interface QuickLogSetInput {
  reps?: number | null;
  load?: number | null;
  loadUnit?: "lb" | "kg" | null;
}

export interface QuickLogMovementInput {
  movementId?: string | null;
  movementName: string;
  sets: QuickLogSetInput[];
}

export interface MovementSummary {
  id: string;
  name: string;
  category: string | null;
  equipment: string | null;
}

export interface WorkoutFeedItem {
  id: string;
  userId: string;
  groupId: string;
  workoutType: string;
  title: string;
  name: string | null;
  durationMinutes: number | null;
  effort: number | null;
  caption: string | null;
  photoPath: string | null;
  photoUrl?: string | null;
  notes: string | null;
  occurredAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt: string;
  displayName: string;
}

export interface HomeData {
  user: {
    id: string;
    displayName: string;
    createdAt: string;
  };
  snapshot: {
    hasWorkoutToday: boolean;
    mostRecentWorkoutToday: WorkoutFeedItem | null;
    workoutsThisWeek: number;
    message: string;
  };
  groups: GroupSummary[];
  selectedGroupId: string | null;
  communityWorkouts: WorkoutFeedItem[];
}
