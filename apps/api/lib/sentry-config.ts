/**
 * Pure Sentry decisions for the API. No SDK import, so a missing DSN is a
 * no-op and the choices can be unit tested without booting Next.js.
 */

const DROP_KEYS = new Set([
  "email",
  "mail",
  "username",
  "ip",
  "ipaddress",
  "authorization",
  "proxyauthorization",
  "cookie",
  "cookies",
  "setcookie",
  "password",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "apikey",
  "body",
  "payload",
  "requestbody",
  "responsebody",
  "comment",
  "comments",
  "caption",
  "note",
  "notes",
  "content",
  "workout",
  "workouts",
  "post",
  "posts",
  "title",
  "displayname",
  "fullname",
  "firstname",
  "lastname",
  "photo",
  "photourl",
  "photopath",
  "query",
  "querystring",
]);

const URL_KEYS = new Set(["url", "href", "uri", "referer", "referrer"]);
const HEADER_ALLOW = new Set(["content-type", "accept", "user-agent", "accept-language"]);
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /Bearer\s+\S+/gi;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

type SentryUser = { id?: unknown; [key: string]: unknown };

export type SentryEventLike = {
  message?: string;
  user?: SentryUser;
  request?: {
    url?: string;
    method?: string;
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown>; [key: string]: unknown }>;
  exception?: { values?: Array<{ value?: string; [key: string]: unknown }>; [key: string]: unknown };
  [key: string]: unknown;
};

export type ApiSentryConfig = {
  enabled: boolean;
  dsn?: string;
  environment: string;
  release: string;
  sendDefaultPii: false;
  tracesSampleRate: 0;
  sourceMapsUpload: boolean;
  org?: string;
  project?: string;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveApiSentryConfig(input: {
  dsn?: string;
  vercelEnv?: string;
  nodeEnv?: string;
  gitSha?: string;
  version?: string;
  authToken?: string;
  org?: string;
  project?: string;
}): ApiSentryConfig {
  const dsn = clean(input.dsn);
  const environment = clean(input.vercelEnv) ?? (input.nodeEnv === "production" ? "production" : "development");
  const sha = clean(input.gitSha);
  const version = clean(input.version) ?? "0.0.0";
  const org = clean(input.org);
  const project = clean(input.project);
  return {
    enabled: Boolean(dsn),
    dsn,
    environment,
    release: sha ? `repin-api@${sha.slice(0, 12)}` : `repin-api@${version}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    sourceMapsUpload: Boolean(clean(input.authToken) && org && project),
    org,
    project,
  };
}

export function sentryUserFromId(userId: string | null | undefined): { id: string } | null {
  if (typeof userId !== "string") return null;
  const id = userId.trim();
  if (!id || id.includes("@")) return null;
  return { id };
}

export function redactSecrets(value: string) {
  return value.replace(EMAIL, "[Filtered]").replace(BEARER, "Bearer [Filtered]").replace(JWT, "[Filtered]");
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

function stripUrlQuery(value: string) {
  const query = value.indexOf("?");
  const hash = value.indexOf("#");
  const cuts = [query, hash].filter((index) => index >= 0);
  if (cuts.length === 0) return value;
  return value.slice(0, Math.min(...cuts));
}

function scrubHeaders(value: unknown): Record<string, string> | undefined {
  const entries: [string, string][] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string") {
        entries.push([item[0], item[1]]);
      }
    }
  } else if (value && typeof value === "object") {
    for (const [key, header] of Object.entries(value)) {
      if (typeof header === "string") entries.push([key, header]);
    }
  }
  const kept: Record<string, string> = {};
  for (const [key, header] of entries) {
    if (HEADER_ALLOW.has(key.toLowerCase())) kept[key] = redactSecrets(header);
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function scrubUnknown(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    const redacted = redactSecrets(value);
    if (key && URL_KEYS.has(normalizeKey(key))) return stripUrlQuery(redacted);
    return redacted;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubUnknown(item));
  if (typeof value === "object") {
    if (key && normalizeKey(key) === "user") {
      const id = (value as SentryUser).id;
      return sentryUserFromId(typeof id === "string" ? id : null) ?? undefined;
    }
    if (key && normalizeKey(key) === "headers") return scrubHeaders(value);
    if (key && normalizeKey(key) === "cookies") return undefined;
    const record = scrubObject(value as Record<string, unknown>);
    return record;
  }
  return undefined;
}

function scrubObject(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DROP_KEYS.has(normalizeKey(key))) continue;
    const scrubbed = scrubUnknown(child, key);
    if (scrubbed !== undefined) next[key] = scrubbed;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  const next: SentryEventLike = { ...event };
  const user = event.user
    ? sentryUserFromId(typeof event.user.id === "string" ? event.user.id : null)
    : undefined;
  if (user) next.user = user;
  else delete next.user;

  if (event.request) {
    const headers = scrubHeaders(event.request.headers);
    const request: SentryEventLike["request"] = {};
    if (typeof event.request.method === "string") request.method = event.request.method;
    if (typeof event.request.url === "string") request.url = stripUrlQuery(redactSecrets(event.request.url));
    if (headers) request.headers = headers;
    next.request = request;
  }

  if (typeof event.message === "string") next.message = redactSecrets(event.message);
  if (event.extra) next.extra = scrubObject(event.extra);
  if (event.contexts) next.contexts = scrubObject(event.contexts);
  if (event.breadcrumbs) {
    next.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      message: typeof breadcrumb.message === "string" ? redactSecrets(breadcrumb.message) : breadcrumb.message,
      data: breadcrumb.data ? scrubObject(breadcrumb.data) : undefined,
    }));
  }
  if (event.exception?.values) {
    next.exception = {
      ...event.exception,
      values: event.exception.values.map((value) => ({
        ...value,
        value: typeof value.value === "string" ? redactSecrets(value.value) : value.value,
      })),
    };
  }
  return next as T;
}
