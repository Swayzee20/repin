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

export const communityReactionTypes = ["fire", "strong", "clap"] as const;

export type CommunityReactionType = (typeof communityReactionTypes)[number];

export type CommunityReactionCounts = Record<CommunityReactionType, number>;

export interface CommunityReactionSummary {
  counts: CommunityReactionCounts;
  total: number;
  viewerReaction: CommunityReactionType | null;
}

export interface CommunityPostComment {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

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

export const runWorkoutSubtypes = ["distance", "tempo", "interval"] as const;
export type RunWorkoutSubtype = (typeof runWorkoutSubtypes)[number];
export type WorkoutSubtype = RunWorkoutSubtype;

export const workoutSessionSegmentTypes = ["work", "recovery"] as const;
export type WorkoutSessionSegmentType = (typeof workoutSessionSegmentTypes)[number];
export const workoutDistanceUnits = ["m", "km", "mi"] as const;
export type WorkoutDistanceUnit = (typeof workoutDistanceUnits)[number];

export interface IntervalPresentationSegment {
  segmentType: WorkoutSessionSegmentType;
  distance: number | null;
  distanceUnit: WorkoutDistanceUnit | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
}

export interface GroupedIntervalSegment {
  quantity: number;
  segment: IntervalPresentationSegment;
}

export function groupConsecutiveIntervalSegments(segments: IntervalPresentationSegment[]) {
  return segments.reduce<GroupedIntervalSegment[]>((groups, segment) => {
    const previous = groups.at(-1);
    if (previous && intervalSegmentsMatch(previous.segment, segment)) previous.quantity += 1;
    else groups.push({ quantity: 1, segment });
    return groups;
  }, []);
}

export function formatGroupedIntervalSegment(group: GroupedIntervalSegment) {
  const { segment } = group;
  const parts: string[] = [];
  if (segment.distance != null && segment.distanceUnit) {
    parts.push(`${formatIntervalNumber(segment.distance)} ${segment.distanceUnit}`);
  }
  if (segment.durationSeconds != null) {
    const duration = formatIntervalDuration(segment.durationSeconds);
    parts.push(segment.distance == null ? `${duration} ${segment.segmentType}` : duration);
  }
  if (!parts.length) parts.push(segment.segmentType === "recovery" ? "Recovery" : "Work interval");
  const main = `${group.quantity > 1 ? `${group.quantity} × ` : ""}${parts.join(" · ")}`;
  const recovery = segment.recoverySeconds != null ? `${segment.recoverySeconds}s recovery` : null;
  return { main, recovery, summary: [main, recovery].filter(Boolean).join(" · ") };
}

function intervalSegmentsMatch(left: IntervalPresentationSegment, right: IntervalPresentationSegment) {
  return left.segmentType === right.segmentType
    && left.distance === right.distance
    && left.distanceUnit === right.distanceUnit
    && left.durationSeconds === right.durationSeconds
    && left.recoverySeconds === right.recoverySeconds;
}

function formatIntervalDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatIntervalNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: false }).format(value);
}

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

export interface WorkoutSessionSegmentInput {
  position: number;
  segmentType: WorkoutSessionSegmentType;
  distance?: number | null;
  distanceUnit?: WorkoutDistanceUnit | null;
  durationSeconds?: number | null;
  recoverySeconds?: number | null;
  notes?: string | null;
  configuration?: Record<string, unknown> | null;
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
  resultSummary?: string | null;
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
  reactionCounts?: CommunityReactionCounts;
  commentCount?: number;
}

export interface WorkoutDetailMetric {
  id: string;
  position: number;
  metricType: WorkoutMetricType;
  label: string | null;
  numericValue: number | null;
  textValue: string | null;
  unit: string | null;
}

export interface WorkoutDetailSet {
  id: string;
  position: number;
  reps: number | null;
  load: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distance: number | null;
  distanceUnit: string | null;
  calories: number | null;
  completed: boolean;
  notes: string | null;
}

export interface WorkoutDetailMovement {
  id: string;
  movementId: string | null;
  movementName: string;
  position: number;
  notes: string | null;
  sets: WorkoutDetailSet[];
}

export interface WorkoutDetailSegment {
  id: string;
  position: number;
  segmentType: WorkoutSessionSegmentType;
  distance: number | null;
  distanceUnit: WorkoutDistanceUnit | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  notes: string | null;
  configuration: Record<string, unknown> | null;
}

export interface CommunityWorkoutDetail extends WorkoutFeedItem {
  communityPostId: string;
  workoutSubtype: WorkoutSubtype | null;
  metrics: WorkoutDetailMetric[];
  movements: WorkoutDetailMovement[];
  segments: WorkoutDetailSegment[];
  reactions: CommunityReactionSummary;
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
    workoutOccurredAtThisWeek: string[];
    workoutsThisWeek: number;
    message: string;
  };
  groups: GroupSummary[];
  selectedGroupId: string | null;
  communityWorkouts: WorkoutFeedItem[];
}

export interface CommunityData {
  groups: GroupSummary[];
  selectedGroupId: string | null;
  communityWorkouts: WorkoutFeedItem[];
}

export interface ProfileData {
  user: HomeData["user"];
  snapshot: HomeData["snapshot"];
  groups: GroupSummary[];
  selectedGroupId: string | null;
}
