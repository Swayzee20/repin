import type { GroupSummary, WorkoutFeedItem } from "@repin/types";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export async function fetchGroupBoard(input: {
  accessToken: string;
  groupId: string;
}) {
  const headers = { Authorization: `Bearer ${input.accessToken}` };
  const encodedGroupId = encodeURIComponent(input.groupId);
  const [groupResponse, workoutsResponse] = await Promise.all([
    fetch(`${apiUrl}/api/groups/${encodedGroupId}`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    }),
    fetch(`${apiUrl}/api/groups/${encodedGroupId}/workouts`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    }),
  ]);
  const groupBody = (await groupResponse.json()) as {
    error?: string;
    group?: GroupSummary;
  };
  const workoutsBody = (await workoutsResponse.json()) as {
    error?: string;
    workouts?: WorkoutFeedItem[];
  };

  if (!groupResponse.ok || !groupBody.group) {
    throw new Error(groupBody.error ?? "Group could not be loaded.");
  }
  if (!workoutsResponse.ok || !workoutsBody.workouts) {
    throw new Error(
      workoutsBody.error ?? "Community Board could not be loaded.",
    );
  }

  return { group: groupBody.group, workouts: workoutsBody.workouts };
}
