import { useCallback, useSyncExternalStore } from "react";

const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

export function readCommentDraft(sessionId: string) {
  return drafts.get(sessionId) ?? "";
}

export function writeCommentDraft(sessionId: string, text: string) {
  if (!text) drafts.delete(sessionId);
  else drafts.set(sessionId, text);
  emit();
}

export function clearCommentDraft(sessionId: string) {
  if (!drafts.has(sessionId)) return;
  drafts.delete(sessionId);
  emit();
}

export function resetCommentDrafts() {
  drafts.clear();
  emit();
}

export function useCommentDraft(sessionId: string | null) {
  const draft = useSyncExternalStore(
    subscribe,
    () => (sessionId ? readCommentDraft(sessionId) : ""),
    () => (sessionId ? readCommentDraft(sessionId) : ""),
  );
  const setDraft = useCallback((text: string) => {
    if (!sessionId) return;
    writeCommentDraft(sessionId, text);
  }, [sessionId]);
  const clearDraft = useCallback(() => {
    if (!sessionId) return;
    clearCommentDraft(sessionId);
  }, [sessionId]);
  return { clearDraft, draft, setDraft };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}
