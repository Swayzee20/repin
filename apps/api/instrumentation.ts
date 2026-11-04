import * as Sentry from "@sentry/nextjs";

import { apiSentryEnabled } from "./lib/sentry";

export async function register() {
  if (!apiSentryEnabled()) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!apiSentryEnabled()) return;
  return Sentry.captureRequestError(...args);
};
