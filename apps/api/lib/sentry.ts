import * as Sentry from "@sentry/nextjs";

import packageJson from "../package.json";
import {
  resolveApiSentryConfig,
  scrubSentryEvent,
  sentryUserFromId,
  type SentryEventLike,
} from "./sentry-config";

const apiSentry = resolveApiSentryConfig({
  dsn: process.env.SENTRY_DSN,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
  version: packageJson.version,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_API,
});

let initialized = false;

export function initApiSentry() {
  if (!apiSentry.enabled || !apiSentry.dsn || initialized) return;
  initialized = true;
  Sentry.init({
    dsn: apiSentry.dsn,
    enabled: true,
    environment: apiSentry.environment,
    release: apiSentry.release,
    tracesSampleRate: 0,
    // SDK 11 replaced sendDefaultPii with dataCollection. These flags keep
    // bodies, cookies, headers, query strings, and stack variables off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as SentryEventLike) as unknown as typeof event;
    },
    beforeSendTransaction() {
      return null;
    },
  });
}

export function setApiSentryUser(userId: string | null | undefined) {
  if (!apiSentry.enabled) return;
  initApiSentry();
  try {
    Sentry.setUser(sentryUserFromId(userId));
  } catch {
    // Auth must succeed even if monitoring is misconfigured.
  }
}

/** Reports an unexpected route failure. Auth and validation errors are not passed here. */
export function reportUnexpectedRouteError(message: string, error: unknown) {
  console.error(message, error);
  if (!apiSentry.enabled) return;
  initApiSentry();
  try {
    Sentry.withScope((scope) => {
      scope.setTag("route_failure", message.slice(0, 200));
      Sentry.captureException(error);
    });
  } catch {
    // The JSON error response is the user-facing behavior. Monitoring is extra.
  }
}

export function apiSentryEnabled() {
  return apiSentry.enabled;
}
