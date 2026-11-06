import "server-only";

import { disableDevicePushTokens } from "@repin/db";
import type { CrewPushAlertType } from "@repin/validation";

const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const chunkSize = 100;

export type ExpoPushMessage = {
  to: string;
  body: string;
  sound: "default";
  channelId: "default";
  data: {
    type: CrewPushAlertType;
    groupId: string;
    sessionId: string;
    postId: string;
  };
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

export async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (!messages.length) return;

  const unregistered: string[] = [];
  for (let index = 0; index < messages.length; index += chunkSize) {
    const chunk = messages.slice(index, index + chunkSize);
    const tickets = await postExpoChunk(chunk);
    tickets.forEach((ticket, ticketIndex) => {
      const token = chunk[ticketIndex]?.to;
      if (
        ticket.status === "error"
        && ticket.details?.error === "DeviceNotRegistered"
        && token
      ) {
        unregistered.push(token);
      }
    });
  }

  if (unregistered.length) {
    await disableDevicePushTokens(unregistered);
  }
}

async function postExpoChunk(chunk: ExpoPushMessage[]): Promise<ExpoTicket[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(chunk),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: ExpoTicket[]; errors?: unknown }
    | null;

  if (!response.ok) {
    console.error("[push] Expo push request failed", {
      status: response.status,
      errors: body?.errors ?? body,
    });
    return [];
  }

  return Array.isArray(body?.data) ? body.data : [];
}
