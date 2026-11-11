import type {
  CurrentBestsResponse,
  PersonalWorkoutDetail,
  PersonalWorkoutPage,
  WorkoutStatsResponse,
  WorkoutType,
} from "@repin/types";
import type { DashboardDistanceUnit } from "@repin/validation";

import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function deviceTimeQuery() {
  return {
    timeZone: deviceTimeZone(),
    timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
  };
}

async function authHeader() {
  if (!supabase) throw new Error("Sign in to view your profile.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to view your profile.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export async function fetchOwnedWorkoutStats(distanceUnit: DashboardDistanceUnit = "mi"): Promise<WorkoutStatsResponse> {
  const headers = await authHeader();
  const search = new URLSearchParams({
    timeZone: deviceTimeZone(),
    distanceUnit,
  });
  const response = await fetch(`${apiUrl}/api/me/workout-stats?${search.toString()}`, {
    headers,
    signal: AbortSignal.timeout(7_500),
  });
  return readJson<WorkoutStatsResponse>(response);
}

export async function fetchOwnedWorkouts(input: {
  cursor?: string | null;
  limit?: number;
  sport?: WorkoutType | null;
  from?: string | null;
  to?: string | null;
} = {}): Promise<PersonalWorkoutPage> {
  const headers = await authHeader();
  const search = new URLSearchParams({ timeZone: deviceTimeZone() });
  if (input.cursor) search.set("cursor", input.cursor);
  if (input.limit) search.set("limit", String(input.limit));
  if (input.sport) search.set("sport", input.sport);
  if (input.from) search.set("from", input.from);
  if (input.to) search.set("to", input.to);
  const response = await fetch(`${apiUrl}/api/me/workouts?${search.toString()}`, {
    headers,
    signal: AbortSignal.timeout(7_500),
  });
  return readJson<PersonalWorkoutPage>(response);
}

export async function fetchOwnedWorkoutDetail(sessionId: string): Promise<PersonalWorkoutDetail> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/me/workouts/${encodeURIComponent(sessionId)}`, {
    headers,
    signal: AbortSignal.timeout(7_500),
  });
  const body = await readJson<{ workout: PersonalWorkoutDetail }>(response);
  return body.workout;
}

export async function fetchOwnedPersonalRecords(): Promise<CurrentBestsResponse> {
  const headers = await authHeader();
  const response = await fetch(`${apiUrl}/api/me/personal-records`, {
    headers,
    signal: AbortSignal.timeout(7_500),
  });
  return readJson<CurrentBestsResponse>(response);
}
