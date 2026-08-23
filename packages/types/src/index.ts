export interface HealthResponse {
  status: "ok";
  timestamp: string;
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
