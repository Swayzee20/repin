import * as Sentry from "@sentry/react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { ComponentType } from "react";
import { Platform } from "react-native";

import {
  resolveMobileSentryConfig,
  scrubSentryEvent,
  sentryUserFromId,
  type SentryEventLike,
} from "./sentry-config";

type SentryExtra = {
  sentryEnvironment?: string;
  sentryRelease?: string;
  sentryDist?: string;
};

const extra = Constants.expoConfig?.extra as SentryExtra | undefined;
const bakedRelease = extra?.sentryRelease;
const bakedDist = extra?.sentryDist;

const mobileSentry = resolveMobileSentryConfig({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  dev: typeof __DEV__ !== "undefined" && __DEV__,
  easBuildProfile: extra?.sentryEnvironment,
  appVersion: Constants.expoConfig?.version,
  gitSha: extra?.sentryDist,
  platform: Platform.OS,
  expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
});

if (Platform.OS === "web") {
  mobileSentry.release = bakedRelease ?? mobileSentry.release;
  mobileSentry.dist = bakedDist ?? mobileSentry.dist;
}

let initialized = false;

/** Starts the SDK only when a public DSN is present. Otherwise the app is unchanged. */
export function initMobileSentry() {
  if (!mobileSentry.enabled || !mobileSentry.dsn || initialized) return;
  initialized = true;
  Sentry.init({
    dsn: mobileSentry.dsn,
    enabled: true,
    environment: mobileSentry.environment,
    release: mobileSentry.release,
    dist: mobileSentry.dist,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    enableNativeFramesTracking: false,
    enableStallTracking: false,
    enableUserInteractionTracing: false,
    enableCaptureFailedRequests: false,
    enableLogs: false,
    enableNative: mobileSentry.enableNative,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as SentryEventLike) as unknown as typeof event;
    },
    beforeSendTransaction() {
      return null;
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data;
      const scrubbed = scrubSentryEvent({
        breadcrumbs: [
          {
            message: breadcrumb.message,
            data: data && typeof data === "object" ? (data as Record<string, unknown>) : undefined,
          },
        ],
      });
      const next = scrubbed.breadcrumbs?.[0];
      if (!next) return null;
      return {
        ...breadcrumb,
        message: next.message,
        data: next.data,
      };
    },
  });
}

export function isSentryTestActionVisible() {
  return mobileSentry.showTestAction;
}

export function setMobileSentryUser(userId: string | null | undefined) {
  if (!mobileSentry.enabled || !initialized) return;
  try {
    Sentry.setUser(sentryUserFromId(userId));
  } catch {
    // A monitoring failure must not affect sign-in.
  }
}

export function captureMobileException(error: unknown) {
  if (!mobileSentry.enabled || !initialized) return;
  try {
    Sentry.captureException(error);
  } catch {
    // The screen that already failed should still be able to show its fallback.
  }
}

export function sendSentryTestError(): "sent" | "disabled" {
  if (!mobileSentry.enabled || !initialized) return "disabled";
  const error = new Error("repin sentry test");
  error.name = "RepinSentryTest";
  captureMobileException(error);
  return "sent";
}

export function wrapRoot<P extends Record<string, unknown>>(Root: ComponentType<P>) {
  if (!mobileSentry.enabled) return Root;
  return Sentry.wrap(Root);
}
