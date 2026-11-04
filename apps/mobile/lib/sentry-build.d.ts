export type MobileSourceMapUpload = {
  organization?: string;
  project?: string;
  disableAutoUpload: boolean;
};

export function resolveSentryEnvironment(input: {
  dev: boolean;
  easBuildProfile?: string;
  vercelEnv?: string;
  nodeEnv?: string;
}): string;

export function sentryTestActionVisible(input: { dev: boolean; environment: string }): boolean;

export function resolveMobileRelease(input: {
  appVersion?: string;
  gitSha?: string;
  platform: string;
}): { release: string | undefined; dist: string | undefined };

export function resolveMobileSourceMapUpload(input: {
  authToken?: string;
  org?: string;
  project?: string;
}): MobileSourceMapUpload;

export function sentryUserFromId(userId: string | null | undefined): { id: string } | null;
