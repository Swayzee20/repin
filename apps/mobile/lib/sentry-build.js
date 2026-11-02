/** Build-time Sentry decisions. Plain JS so Expo can load it from app.config.ts. */

function clean(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function resolveSentryEnvironment(input) {
  return (
    clean(input.easBuildProfile) ??
    clean(input.vercelEnv) ??
    (input.dev || input.nodeEnv !== "production" ? "development" : "production")
  );
}

function sentryTestActionVisible(input) {
  if (input.dev) return true;
  return input.environment === "development" || input.environment === "preview";
}

/** Native releases come from the iOS SDK so they match the EAS debug-symbol upload. */
function resolveMobileRelease(input) {
  if (input.platform !== "web") return { release: undefined, dist: undefined };
  const version = clean(input.appVersion) ?? "0.0.0";
  const sha = clean(input.gitSha);
  return {
    release: `repin@${version}`,
    dist: sha ? sha.slice(0, 12) : undefined,
  };
}

/**
 * Map the EAS env names onto the Expo config plugin. The auth token is never
 * returned: the plugin reads SENTRY_AUTH_TOKEN from the environment at build
 * time. Upload is skipped unless org, project, and token are all set.
 */
function resolveMobileSourceMapUpload(input) {
  const organization = clean(input.org);
  const project = clean(input.project);
  const authToken = clean(input.authToken);
  return {
    organization,
    project,
    disableAutoUpload: !(organization && project && authToken),
  };
}

function sentryUserFromId(userId) {
  if (typeof userId !== "string") return null;
  const id = userId.trim();
  if (!id || id.includes("@")) return null;
  return { id };
}

module.exports = {
  resolveMobileRelease,
  resolveMobileSourceMapUpload,
  resolveSentryEnvironment,
  sentryTestActionVisible,
  sentryUserFromId,
};
