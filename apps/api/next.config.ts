import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import packageJson from "./package.json";
import { resolveApiSentryConfig } from "./lib/sentry-config";

const sentry = resolveApiSentryConfig({
  dsn: process.env.SENTRY_DSN,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
  version: packageJson.version,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_API,
});

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@repin/db", "@repin/types", "@repin/validation"],
};

export default withSentryConfig(nextConfig, {
  org: sentry.org,
  project: sentry.project,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !sentry.sourceMapsUpload,
  telemetry: false,
  sourcemaps: {
    disable: sentry.sourceMapsUpload ? false : true,
  },
  release: {
    name: sentry.release,
    create: sentry.sourceMapsUpload,
    finalize: sentry.sourceMapsUpload,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
  errorHandler(error) {
    console.warn("[sentry] Source map upload did not finish. The build will continue.", error);
  },
});
