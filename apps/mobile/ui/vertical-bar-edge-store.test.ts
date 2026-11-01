import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  createStripStore,
  edgeResolved,
  stripPresent,
  type StatusBarModule,
  type StripState,
} from "./vertical-bar-edge-store";

// The layout script lists files explicitly. This registers the Settings header cases.
import "./settings-header.test";

type HarnessOptions = {
  os?: string;
  statusBar?: StatusBarModule | null;
  version?: string | number;
};

function createHarness(options: HarnessOptions = {}) {
  const edgeListeners = new Set<(event: { edge?: string | null }) => void>();
  let addCount = 0;
  let activeListeners = 0;
  const appListeners = new Set<(state: string) => void>();
  const timers: { callback: () => void; cancelled: boolean; delayMs: number }[] = [];
  const statusBar = options.statusBar === undefined
    ? {
      addListener(eventName: "onVerticalBarEdgeChange", listener: (event: { edge?: string | null }) => void) {
        assert.equal(eventName, "onVerticalBarEdgeChange");
        addCount += 1;
        activeListeners += 1;
        edgeListeners.add(listener);
        return {
          remove() {
            if (edgeListeners.delete(listener)) activeListeners -= 1;
          },
        };
      },
    }
    : options.statusBar;

  const store = createStripStore({
    appState: {
      addEventListener(type, listener) {
        assert.equal(type, "change");
        appListeners.add(listener);
        return {
          remove() {
            appListeners.delete(listener);
          },
        };
      },
    },
    os: options.os ?? "ios",
    schedule(callback, delayMs) {
      const entry = { callback, cancelled: false, delayMs };
      timers.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    statusBar,
    version: options.version ?? "27.1",
  });

  function fireTimer() {
    const entry = timers.find((timer) => !timer.cancelled);
    assert.ok(entry, "expected a pending retry");
    entry.cancelled = true;
    assert.equal(entry.delayMs, 1000);
    entry.callback();
  }

  return {
    activeListeners: () => activeListeners,
    addCount: () => addCount,
    appListenerCount: () => appListeners.size,
    become(state: string) {
      for (const listener of [...appListeners]) listener(state);
    },
    emit(edge?: string | null) {
      for (const listener of [...edgeListeners]) listener({ edge });
    },
    fireTimer,
    pendingTimers: () => timers.filter((timer) => !timer.cancelled).length,
    readLate(): StripState {
      let snapshot = store.getState();
      store.subscribe(() => {
        snapshot = store.getState();
      });
      return snapshot;
    },
    store,
  };
}

test("an edge event moves the store from pending to known", () => {
  const harness = createHarness();
  assert.deepEqual(harness.store.getState(), { status: "pending", edge: null });
  assert.equal(edgeResolved(harness.store.getState()), false);
  assert.equal(stripPresent(harness.store.getState()), false);
  assert.equal(harness.addCount(), 1);
  assert.equal(harness.activeListeners(), 1);

  const seen: StripState[] = [];
  harness.store.subscribe(() => {
    seen.push(harness.store.getState());
  });
  harness.emit("trailing");

  assert.deepEqual(seen, [{ status: "known", edge: "trailing" }]);
  assert.equal(stripPresent(harness.store.getState()), true);
  assert.equal(edgeResolved(harness.store.getState()), true);
  assert.equal(harness.pendingTimers(), 0);

  harness.emit("sideways");
  assert.deepEqual(harness.store.getState(), { status: "known", edge: null });
  assert.equal(stripPresent(harness.store.getState()), false);
  assert.equal(edgeResolved(harness.store.getState()), true);
  assert.equal(harness.addCount(), 1);
});

test("a late subscriber gets the cached edge", () => {
  const harness = createHarness();
  harness.emit("leading");
  const snapshot = harness.readLate();
  assert.deepEqual(snapshot, { status: "known", edge: "leading" });
  assert.equal(stripPresent(snapshot), true);

  harness.emit("trailing");
  assert.equal(harness.readLate().edge, "trailing");
});

test("a missed first event retries while pending, including when the app becomes active", () => {
  const harness = createHarness();
  assert.equal(harness.pendingTimers(), 1);

  harness.fireTimer();
  assert.equal(harness.store.getState().status, "pending");
  assert.equal(harness.addCount(), 2);
  assert.equal(harness.activeListeners(), 1);

  harness.become("background");
  assert.equal(harness.addCount(), 2);

  harness.become("active");
  assert.equal(harness.store.getState().status, "pending");
  assert.equal(harness.addCount(), 3);
  assert.equal(harness.activeListeners(), 1);

  harness.fireTimer();
  assert.deepEqual(harness.store.getState(), { status: "known", edge: null });
  assert.equal(edgeResolved(harness.store.getState()), true);
  assert.equal(stripPresent(harness.store.getState()), false);
  assert.equal(harness.addCount(), 3);
  assert.equal(harness.activeListeners(), 1);
  assert.equal(harness.pendingTimers(), 0);

  harness.become("active");
  assert.equal(harness.addCount(), 3);
  harness.emit("leading");
  assert.deepEqual(harness.store.getState(), { status: "known", edge: "leading" });
});

test("an edge event before the retry deadline does not resubscribe", () => {
  const harness = createHarness();
  harness.emit("leading");
  assert.equal(harness.pendingTimers(), 0);
  assert.equal(harness.addCount(), 1);
  harness.become("active");
  assert.equal(harness.addCount(), 1);
  assert.deepEqual(harness.store.getState(), { status: "known", edge: "leading" });
});

test("the store is unsupported on non-iOS, without a native module, and below iOS 27.1", () => {
  for (const options of [
    { os: "android", version: "27.1" },
    { os: "web", version: 27.1 },
    { os: "ios", statusBar: null, version: "27.1" },
    { os: "ios", version: "27.0" },
    { os: "ios", version: 27 },
    { os: "ios", version: "26.5" },
  ] satisfies HarnessOptions[]) {
    let added = false;
    const harness = createHarness({
      ...options,
      statusBar: options.statusBar === null
        ? null
        : {
          addListener() {
            added = true;
            return { remove() {} };
          },
        },
    });
    assert.equal(added, false, JSON.stringify(options));
    assert.deepEqual(harness.store.getState(), { status: "unsupported", edge: null });
    assert.equal(edgeResolved(harness.store.getState()), true);
    assert.equal(stripPresent(harness.store.getState()), false);
    assert.equal(harness.appListenerCount(), 0);
    assert.equal(harness.pendingTimers(), 0);
    harness.become("active");
    assert.equal(harness.store.getState().status, "unsupported");
  }

  const supported = createHarness({ os: "ios", version: "27.1" });
  assert.equal(supported.store.getState().status, "pending");
  assert.equal(supported.addCount(), 1);
  assert.equal(supported.appListenerCount(), 1);
  assert.equal(createHarness({ os: "ios", version: "27.1.2" }).store.getState().status, "pending");
});

test("the app module reads the shared store and never calls getVerticalBarEdge", () => {
  const app = readFileSync(new URL("./vertical-bar-edge.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("./vertical-bar-edge-store.ts", import.meta.url), "utf8");
  assert.equal(app.includes("useSyncExternalStore"), true);
  assert.equal(app.split("createStripStore(").length - 1, 1);
  for (const source of [app, store]) {
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
      })
      .join("\n");
    assert.equal(code.includes("getVerticalBarEdge("), false);
    assert.equal(code.includes(".getVerticalBarEdge"), false);
  }
});
