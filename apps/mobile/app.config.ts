import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";
import { resolveMobileRelease, resolveMobileSourceMapUpload, resolveSentryEnvironment } from "./lib/sentry-build";

const base = appJson.expo as ExpoConfig;

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const upload = resolveMobileSourceMapUpload({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_MOBILE,
});

const sentryEnvironment = resolveSentryEnvironment({
  dev: process.env.NODE_ENV !== "production",
  easBuildProfile: process.env.EAS_BUILD_PROFILE,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
});

const { release: sentryRelease, dist: sentryDist } = resolveMobileRelease({
  platform: "web",
  appVersion: base.version,
  gitSha: clean(process.env.VERCEL_GIT_COMMIT_SHA) ?? clean(process.env.EAS_BUILD_GIT_COMMIT_HASH),
});

function isSentryPlugin(plugin: NonNullable<ExpoConfig["plugins"]>[number]) {
  const name = typeof plugin === "string" ? plugin : Array.isArray(plugin) ? plugin[0] : null;
  return name === "@sentry/react-native" || name === "@sentry/react-native/expo";
}

const sentryPlugin: NonNullable<ExpoConfig["plugins"]>[number] = [
  "@sentry/react-native/expo",
  {
    url: "https://sentry.io/",
    organization: upload.organization,
    project: upload.project,
    disableAutoUpload: upload.disableAutoUpload,
  },
];

const config: ExpoConfig = {
  ...base,
  plugins: [...(base.plugins ?? []).filter((plugin) => !isSentryPlugin(plugin)), sentryPlugin],
  extra: {
    ...base.extra,
    sentryEnvironment,
    sentryRelease,
    sentryDist,
  },
};

export default config;
