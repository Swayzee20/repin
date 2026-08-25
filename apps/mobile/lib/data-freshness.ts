export const TAB_DATA_STALE_MS = 45_000;

export type FreshnessRecord = {
  key: string;
  loadedAt: number;
  workoutRevision: number;
};

let workoutDataRevision = 0;

export function getWorkoutDataRevision() {
  return workoutDataRevision;
}

export function markWorkoutDataStale() {
  workoutDataRevision += 1;
}

export function isFresh(
  record: FreshnessRecord | null,
  key: string,
  workoutRevision: number,
  now = Date.now(),
) {
  return Boolean(
    record &&
      record.key === key &&
      record.workoutRevision === workoutRevision &&
      now - record.loadedAt < TAB_DATA_STALE_MS,
  );
}
