import type { LayoutMode } from "../ui/layout-math";

export type CommunitySelectionWorkout = {
  completedAt?: string | null;
  createdAt?: string | null;
  id: string;
  occurredAt?: string | null;
  updatedAt?: string | null;
};

export type CommunitySelection =
  | { kind: "auto"; sessionId: string }
  | { kind: "explicit"; sessionId: string }
  | { kind: "none" };

export type CommunityFoldEffect = {
  closeModalImmediately: boolean;
  openModalSessionId: string | null;
  setExplicitPostId: string | null;
};

const noFoldEffect: CommunityFoldEffect = {
  closeModalImmediately: false,
  openModalSessionId: null,
  setExplicitPostId: null,
};

export function readCommunityPostParam(value: string | string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function newestWorkoutId(workouts: readonly CommunitySelectionWorkout[]) {
  if (workouts.length === 0) return null;
  const ranked = [...workouts].sort((left, right) => {
    const byTime = workoutTime(right) - workoutTime(left);
    if (byTime !== 0) return byTime;
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
      || right.id.localeCompare(left.id);
  });
  return ranked[0]?.id ?? null;
}

/** Route param wins. With no param, the newest post of the loaded day is auto. */
export function resolveCommunitySelection(input: {
  postParam: string | null;
  workouts: readonly CommunitySelectionWorkout[];
}): CommunitySelection {
  if (input.postParam) return { kind: "explicit", sessionId: input.postParam };
  const sessionId = newestWorkoutId(input.workouts);
  if (!sessionId) return { kind: "none" };
  return { kind: "auto", sessionId };
}

export function communitySelectionClears(input: {
  nextDayKey: string;
  nextGroupId: string | null;
  previousDayKey: string;
  previousGroupId: string | null;
}) {
  return input.previousGroupId !== input.nextGroupId || input.previousDayKey !== input.nextDayKey;
}

/**
 * Fold rules from spec §5.2. Wide uses the same single-column sheet as compact.
 * Staying inside two-pane, or moving between compact and wide, does not retarget.
 */
export function communityFoldTransition(input: {
  modalSessionId: string | null;
  nextMode: LayoutMode;
  previousMode: LayoutMode;
  selection: CommunitySelection;
}): CommunityFoldEffect {
  if (input.previousMode === input.nextMode) return noFoldEffect;
  const leavingTwoPane = input.previousMode === "twoPane" && input.nextMode !== "twoPane";
  const enteringTwoPane = input.nextMode === "twoPane" && input.previousMode !== "twoPane";
  if (leavingTwoPane && input.selection.kind === "explicit") {
    return {
      closeModalImmediately: false,
      openModalSessionId: input.selection.sessionId,
      setExplicitPostId: null,
    };
  }
  if (enteringTwoPane && input.modalSessionId) {
    return {
      closeModalImmediately: true,
      openModalSessionId: null,
      setExplicitPostId: input.modalSessionId,
    };
  }
  return noFoldEffect;
}

function workoutTime(workout: CommunitySelectionWorkout) {
  for (const value of [workout.occurredAt, workout.completedAt, workout.createdAt, workout.updatedAt]) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}
