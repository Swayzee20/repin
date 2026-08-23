import { resolveUserDisplayName } from "@repin/types";

export function withResolvedDisplayName<T extends { displayName: string }>(value: T): T {
  return {
    ...value,
    displayName: resolveUserDisplayName({ displayName: value.displayName }),
  };
}
