export type LastKnownLayout = {
  activityRowCount: number;
  crewName: string | null;
  firstName: string | null;
  highlightsShown: boolean;
  pinnedPostShown: boolean;
};

export function lastKnownLayoutKey(userId: string) {
  return `last-known-layout:${userId}`;
}

export function emptyLastKnownLayout(): LastKnownLayout {
  return {
    activityRowCount: 1,
    crewName: null,
    firstName: null,
    highlightsShown: false,
    pinnedPostShown: false,
  };
}

export function parseLastKnownLayout(raw: string | null): LastKnownLayout | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastKnownLayout>;
    if (!value || typeof value !== "object") return null;
    return {
      activityRowCount: Number.isFinite(value.activityRowCount)
        ? Math.max(0, Math.floor(value.activityRowCount as number))
        : 1,
      crewName: typeof value.crewName === "string" && value.crewName.trim() ? value.crewName : null,
      firstName: typeof value.firstName === "string" && value.firstName.trim() ? value.firstName : null,
      highlightsShown: value.highlightsShown === true,
      pinnedPostShown: value.pinnedPostShown === true,
    };
  } catch {
    return null;
  }
}
