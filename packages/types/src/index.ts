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

export const PLACEHOLDER_DISPLAY_NAME = "repin member";
const LEGACY_PLACEHOLDER_DISPLAY_NAMES = ["RepIn member"];

export function isPlaceholderDisplayName(value: string | null | undefined) {
  return value === PLACEHOLDER_DISPLAY_NAME || LEGACY_PLACEHOLDER_DISPLAY_NAMES.includes(value ?? "");
}

export function personFirstName(displayName: string | null | undefined) {
  const cleaned = displayName?.trim().replace(/\s+/g, " ") ?? "";
  return cleaned.split(" ")[0] || "Someone";
}

export function resolveUserDisplayName(input: UserDisplayNameInput) {
  const firstName = cleanNameValue(input.firstName);
  const lastName = cleanNameValue(input.lastName);

  if (firstName) {
    return lastName ? `${firstName} ${firstCharacter(lastName).toLocaleUpperCase()}.` : firstName;
  }

  const displayName = cleanNameValue(input.displayName);
  if (displayName) {
    if (isPlaceholderDisplayName(displayName)) return PLACEHOLDER_DISPLAY_NAME;

    const parts = displayName.split(/\s+/);
    if (parts.length >= 2 && parts.every((part) => namePartPattern.test(part))) {
      return `${parts[0]} ${firstCharacter(parts.at(-1) ?? "").toLocaleUpperCase()}.`;
    }

    return displayName;
  }

  const email = cleanNameValue(input.email);
  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || PLACEHOLDER_DISPLAY_NAME;
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
  photoPath?: string | null;
  photoUrl?: string | null;
  memberCount?: number;
}

export interface CrewMemberSummary {
  userId: string;
  displayName: string;
  role: GroupRole;
  isYou: boolean;
  workoutsThisWeek: number;
}

export interface CrewNotificationState {
  muteAll: boolean;
  crewWorkout: boolean;
  crewComment: boolean;
  crewReaction: boolean;
  summary: string;
}

export interface CrewPage {
  group: GroupSummary & {
    photoPath: string | null;
    photoUrl: string | null;
    memberCount: number;
  };
  members: CrewMemberSummary[];
  notifications: CrewNotificationState;
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
  "cycling",
  "strength_training",
  "powerlifting",
  "hiit",
  "functional_fitness",
  "other",
] as const;

export type WorkoutType = (typeof workoutTypes)[number];

export const workoutTypeLabels: Record<WorkoutType, string> = {
  run: "Run",
  walk: "Walk",
  cycling: "Cycling",
  strength_training: "Strength Training",
  powerlifting: "Powerlifting",
  hiit: "HIIT",
  functional_fitness: "Functional Fitness",
  other: "Other",
};

export const workoutTypesWithFeedMetrics = [
  "run",
  "walk",
  "cycling",
  "hiit",
  "functional_fitness",
  "other",
] as const;

export const communityReactionTypes = ["fire", "strong", "clap"] as const;

export const contentReportTargetTypes = ["post", "comment"] as const;
export const contentReportReasons = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence_self_harm",
  "false_info",
  "other",
] as const;
export const contentReportReasonLabels: Record<
  (typeof contentReportReasons)[number],
  string
> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  hate: "Hate",
  sexual: "Nudity or sexual content",
  violence_self_harm: "Violence or self-harm",
  false_info: "False information",
  other: "Something else",
};
export const contentReportReasonDetails: Record<
  (typeof contentReportReasons)[number],
  string
> = {
  spam: "Ads, scams, or the same thing over and over",
  harassment: "Picking on, threatening, or shaming someone",
  hate: "Attacking someone for who they are",
  sexual: "Explicit photos or sexual messages",
  violence_self_harm: "Threats, gore, or someone who might hurt themselves",
  false_info: "Misleading health claims or made-up results",
  other: "Tell us what's going on",
};

export type ContentReportTargetType = (typeof contentReportTargetTypes)[number];
export type ContentReportReason = (typeof contentReportReasons)[number];

export interface ContentReportSummary {
  id: string;
  targetType: ContentReportTargetType;
  targetId: string;
  workoutSessionId: string | null;
  reason: ContentReportReason;
  note: string | null;
  createdAt: string;
  excerpt: string;
  authorDisplayName: string;
  reporterDisplayName: string;
}

export interface BlockedUserSummary {
  userId: string;
  displayName: string;
  blockedAt: string;
}

export const reportConfirmationMessage =
  "Thanks, we got your report. This is hidden for you.";

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

export const workoutFormats = ["amrap", "for_time", "emom", "rounds"] as const;
export type WorkoutFormat = (typeof workoutFormats)[number];

export interface AmrapScore {
  rounds: number;
  reps: number;
}

export type ForTimeScore =
  | { finished: true; timeSeconds: number }
  | { finished: false; reps: number };

export interface RoundsScore {
  timeSeconds: number;
}

export type WorkoutFormatDetail =
  | { type: "amrap"; durationSeconds: number | null; score: AmrapScore | null }
  | {
      type: "for_time";
      timeCapSeconds: number | null;
      rounds: number | null;
      score: ForTimeScore | null;
    }
  | { type: "emom"; durationSeconds: number | null; intervalSeconds: number | null; score: null }
  | { type: "rounds"; rounds: number; score: RoundsScore | null };

export interface WorkoutFormatColumns {
  workoutFormat: WorkoutFormat | null;
  formatDurationSeconds: number | null;
  formatIntervalSeconds: number | null;
  formatRounds: number | null;
  timeCapSeconds: number | null;
  scoreFinished: boolean | null;
  scoreTimeSeconds: number | null;
  scoreRounds: number | null;
  scoreReps: number | null;
}

export interface WorkoutEditState {
  workoutType: string;
  workoutFormat: WorkoutFormat | null;
  hasMeterDistance: boolean;
}

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
  distance?: number | null;
  distanceUnit?: WorkoutDistanceUnit | null;
  calories?: number | null;
  durationSeconds?: number | null;
  count?: number;
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

export interface RecentCustomMovement {
  name: string;
}

export interface MovementLastSessionSet {
  reps: number | null;
  load: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distance: number | null;
  distanceUnit: string | null;
  calories: number | null;
}

export interface MovementLastSession {
  occurredAt: string;
  movementId: string | null;
  movementName: string;
  sets: MovementLastSessionSet[];
}

export const personalRecordKinds = [
  "heaviest_single",
  "distance_time",
  "amrap",
  "for_time",
] as const;
export type PersonalRecordKind = (typeof personalRecordKinds)[number];

export const personalRecordSources = ["logged", "backfill"] as const;
export type PersonalRecordSource = (typeof personalRecordSources)[number];

export const distancePrLanes = ["1mi", "5k", "10k", "half", "marathon"] as const;
export type DistancePrLane = (typeof distancePrLanes)[number];

export interface PrBadge {
  id: string;
  kind: PersonalRecordKind;
  key: string;
  label: string;
  value: string;
}

export const goalKinds = ["volume", "time", "lift"] as const;
export type GoalKind = (typeof goalKinds)[number];

export const goalMetrics = [
  "workout_count",
  "distance",
  "minutes",
  "load",
  "time",
] as const;
export type GoalMetric = (typeof goalMetrics)[number];

export const goalSchedules = ["one_time", "weekly", "monthly"] as const;
export type GoalSchedule = (typeof goalSchedules)[number];

export const goalStates = [
  "active",
  "reached",
  "expired",
  "archived",
  "needs_review",
] as const;
export type GoalState = (typeof goalStates)[number];

export const goalPeriodStates = ["pending", "reached", "invalidated"] as const;
export type GoalPeriodState = (typeof goalPeriodStates)[number];

export const goalCompletionMethods = ["auto", "manual"] as const;
export type GoalCompletionMethod = (typeof goalCompletionMethods)[number];

export const goalDistanceUnits = ["mi", "km", "m"] as const;
export type GoalDistanceUnit = (typeof goalDistanceUnits)[number];

export const goalLoadUnits = ["lb", "kg"] as const;
export type GoalLoadUnit = (typeof goalLoadUnits)[number];

export const MAX_ACTIVE_GOALS = 5;

export interface GoalBadge {
  id: string;
  periodId: string;
  label: string;
  value: string;
}

export interface GoalReached {
  goalId: string;
  periodId: string;
  title: string;
  resultLine: string;
  targetLine: string;
  kind: GoalKind;
}

export interface GoalDetectionResult {
  reached: GoalReached[];
  communityPostId: string | null;
  crewName: string | null;
}

export interface GoalProgress {
  current: number;
  target: number;
  ratio: number;
  label: string;
  periodLabel: string | null;
  lastQualifyingLabel: string | null;
}

export interface GoalSummary {
  id: string;
  title: string;
  kind: GoalKind;
  metric: GoalMetric;
  sportFilter: WorkoutType | null;
  schedule: GoalSchedule;
  state: GoalState;
  displayUnit: string | null;
  targetValue: number;
  timeZone: string;
  activationAt: string;
  deadlineAt: string | null;
  activeSlot: number | null;
  createdAt: string;
  progress: GoalProgress;
  completionMethod: GoalCompletionMethod | null;
  shareable: boolean;
  shareCrewName: string | null;
  sourceSessionId: string | null;
  sourceGroupId: string | null;
  currentPeriodId: string | null;
}

export interface GoalDetail extends GoalSummary {
  prKind: PersonalRecordKind | null;
  prKey: string | null;
  movementId: string | null;
  movementName: string | null;
  lane: DistancePrLane | null;
  helper: string;
  canMarkDone: boolean;
  canReopen: boolean;
  reopenBlocked: boolean;
  archivedAt: string | null;
}

export interface GoalsListResponse {
  active: GoalSummary[];
  history: GoalSummary[];
  activeCount: number;
  cap: number;
}

export const durationMinutesError =
  "Enter a whole number from 1 to 1,440, or leave this blank.";

export interface PrPrompt {
  kind: PersonalRecordKind;
  key: string;
  title: string;
  resultLine: string;
  intro: "one_rep" | "for_time";
}

export interface DetectedPr {
  kind: PersonalRecordKind;
  key: string;
  label: string;
  value: string;
  delta: string | null;
  autoDetected: boolean;
}

export interface PrDetectionResult {
  prompts: PrPrompt[];
  detected: DetectedPr[];
  communityPostId: string | null;
  crewName: string | null;
}

export interface WorkoutFeedItem {
  id: string;
  communityPostId?: string;
  userId: string;
  groupId: string;
  workoutType: string;
  workoutFormat?: WorkoutFormat | null;
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
  prBadges?: PrBadge[];
  goalBadges?: GoalBadge[];
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
  viewerRole?: GroupRole;
  workoutSubtype: WorkoutSubtype | null;
  format?: WorkoutFormatDetail | null;
  logVersion?: 1 | 2;
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

export const dashboardDistanceUnits = ["mi", "km"] as const;
export type DashboardDistanceUnit = (typeof dashboardDistanceUnits)[number];

export const personalRecordKindGroupLabels: Record<PersonalRecordKind, string> = {
  heaviest_single: "Heaviest singles",
  distance_time: "Distance times",
  amrap: "AMRAP",
  for_time: "For Time",
};

export interface PersonalWorkoutListItem {
  id: string;
  workoutType: string;
  title: string;
  name: string | null;
  occurredAt: string;
  durationMinutes: number | null;
  effort: number | null;
  resultSummary: string | null;
  hasDetailedResults: boolean;
}

export interface PersonalWorkoutPage {
  workouts: PersonalWorkoutListItem[];
  nextCursor: string | null;
}

export interface PersonalWorkoutDetail {
  id: string;
  workoutType: string;
  workoutSubtype: WorkoutSubtype | null;
  title: string;
  name: string | null;
  occurredAt: string;
  durationMinutes: number | null;
  effort: number | null;
  format: WorkoutFormatDetail | null;
  metrics: WorkoutDetailMetric[];
  movements: WorkoutDetailMovement[];
  segments: WorkoutDetailSegment[];
  resultSummary: string | null;
  hasDetailedResults: boolean;
  recordedSeconds: number | null;
  prBadges: PrBadge[];
  goalBadges: GoalBadge[];
  currentBestSetIds: string[];
  startingBestSetIds: string[];
  baselineOnly: boolean;
}

export interface WorkoutPeriodStats {
  period: "week" | "month";
  start: string;
  end: string;
  rangeLabel: string;
  workoutCount: number;
  recordedSeconds: number | null;
  recordedMeters: number | null;
  missingDurationCount: number;
  distanceWorkoutCount: number;
  distanceWithValueCount: number;
  loggedDistanceUnits: string[];
}

export interface WorkoutStatsResponse {
  timeZone: string;
  timeZoneLabel: string;
  week: WorkoutPeriodStats;
  month: WorkoutPeriodStats;
}

export interface CurrentBest {
  id: string;
  kind: PersonalRecordKind;
  key: string;
  label: string;
  value: string;
  baselineOnly: boolean;
  celebrated: boolean;
  sourceSessionId: string | null;
  sourceSetId: string | null;
  sourceOccurredAt: string | null;
  sourceAvailable: boolean;
}

export interface CurrentBestsResponse {
  bests: CurrentBest[];
}
