export type VerticalBarEdge = "leading" | "trailing";

export type StripStatus = "unsupported" | "pending" | "known";

export type StripState = {
  status: StripStatus;
  edge: VerticalBarEdge | null;
};

export type StatusBarSubscription = { remove: () => void };

export type StatusBarModule = {
  addListener: (
    eventName: "onVerticalBarEdgeChange",
    listener: (event: { edge?: string | null }) => void,
  ) => StatusBarSubscription;
};

export type AppStateLike = {
  addEventListener: (
    type: "change",
    listener: (state: string) => void,
  ) => { remove: () => void };
};

const RETRY_AFTER_MS = 1000;
const MAX_RETRIES = 2;

/**
 * One app-wide strip store. Do not call `getVerticalBarEdge()`; that synchronous hop
 * deadlocks the main thread (0x8BADF00D). The native module sends the current edge
 * from OnStartObserving, and only when the listener count goes from 0 to 1.
 */
export function createStripStore(deps: {
  os: string;
  version: string | number;
  statusBar: StatusBarModule | null;
  appState: AppStateLike;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}) {
  const schedule = deps.schedule ?? ((callback, delayMs) => {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  });

  const listeners = new Set<() => void>();
  const unsupported = deps.os !== "ios"
    || deps.statusBar === null
    || parseFloat(String(deps.version)) < 27.1;

  let state: StripState = unsupported
    ? { status: "unsupported", edge: null }
    : { status: "pending", edge: null };
  let edgeSubscription: StatusBarSubscription | null = null;
  let cancelRetry: (() => void) | null = null;
  let retries = 0;

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  function setState(next: StripState) {
    if (next.status === state.status && next.edge === state.edge) return;
    state = next;
    emit();
  }

  function normalizeEdge(edge: string | null | undefined): VerticalBarEdge | null {
    return edge === "leading" || edge === "trailing" ? edge : null;
  }

  function armRetryTimer() {
    cancelRetry?.();
    cancelRetry = schedule(() => {
      cancelRetry = null;
      retryOrGiveUp();
    }, RETRY_AFTER_MS);
  }

  function listen() {
    const statusBar = deps.statusBar;
    if (!statusBar) return;
    edgeSubscription = statusBar.addListener("onVerticalBarEdgeChange", (event) => {
      cancelRetry?.();
      cancelRetry = null;
      setState({ status: "known", edge: normalizeEdge(event.edge) });
    });
    if (state.status === "pending") armRetryTimer();
  }

  function retryOrGiveUp() {
    if (state.status !== "pending") return;
    if (retries >= MAX_RETRIES) {
      cancelRetry?.();
      cancelRetry = null;
      setState({ status: "known", edge: null });
      return;
    }
    retries += 1;
    edgeSubscription?.remove();
    edgeSubscription = null;
    listen();
  }

  if (!unsupported && deps.statusBar) {
    listen();
    // Kept for the life of the app. Becoming active while the first event was missed
    // drops the listener count to 0 and back to 1, so OnStartObserving sends again.
    deps.appState.addEventListener("change", (next) => {
      if (next === "active" && state.status === "pending") retryOrGiveUp();
    });
  }

  return {
    getState(): StripState {
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function stripPresent(state: StripState): boolean {
  return state.status === "known" && state.edge !== null;
}

export function edgeResolved(state: StripState): boolean {
  return state.status !== "pending";
}
