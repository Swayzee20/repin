const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function apiErrorMessage(
  status: number,
  body: { error?: unknown } | null | undefined,
) {
  const message = body?.error;
  if (typeof message === "string" && message.trim()) return message;
  return `Request failed (${status})`;
}

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await response.json().catch(() => null)) as T & { error?: string; code?: string };
  if (!response.ok) {
    const error = new Error(apiErrorMessage(response.status, body)) as Error & {
      status: number;
      code?: string;
    };
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}
