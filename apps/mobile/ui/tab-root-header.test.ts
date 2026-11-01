import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { roundIconDiameter } from "./primitive-state";
import { tabRootChrome, tabRootHeaderButtonDiameter, webTabIconName, type TabRootChrome } from "./tab-root-header";
import { size } from "./theme";
import {
  createStripStore,
  type StatusBarModule,
  type StripState,
} from "./vertical-bar-edge-store";

const signedIn = { hasSelectedGroup: true, hasSession: true, platform: "ios" };

function chrome(state: StripState, platform = "ios", extras: Partial<typeof signedIn> = {}): TabRootChrome {
  return tabRootChrome(state, { ...signedIn, ...extras, platform });
}

test("the header plus follows strip present, strip absent, and pending", () => {
  const pending = chrome({ status: "pending", edge: null });
  assert.equal(pending.headerShown, false);
  assert.equal(pending.slot, "hidden");
  assert.equal(pending.control, "none");

  const absent = chrome({ status: "known", edge: null });
  assert.equal(absent.headerShown, true);
  assert.equal(absent.slot, "top-bar");
  assert.equal(absent.control, "toolbar");

  for (const edge of ["leading", "trailing"] as const) {
    const present = chrome({ status: "known", edge });
    assert.equal(present.headerShown, true);
    assert.equal(present.slot, "strip");
    assert.equal(present.control, "toolbar");
  }

  const unsupported = chrome({ status: "unsupported", edge: null });
  assert.equal(unsupported.headerShown, true);
  assert.equal(unsupported.slot, "top-bar");
  assert.equal(unsupported.control, "toolbar");
});

test("a missing session or group hides the plus and still shows a resolved header", () => {
  const state: StripState = { status: "known", edge: null };
  for (const extras of [{ hasSession: false }, { hasSelectedGroup: false }]) {
    const hidden = chrome(state, "ios", extras);
    assert.equal(hidden.headerShown, true);
    assert.equal(hidden.slot, "hidden");
    assert.equal(hidden.control, "none");
  }
  const pending = chrome({ status: "pending", edge: null }, "ios", { hasSession: false });
  assert.equal(pending.headerShown, false);
  assert.equal(pending.control, "none");
});

test("unfolding does not flash a top-bar plus", () => {
  const pending: StripState = { status: "pending", edge: null };
  const folded: StripState = { status: "known", edge: null };
  const unfolded: StripState = { status: "known", edge: "leading" };

  const coldLaunch = [pending, unfolded].map((state) => chrome(state));
  assert.deepEqual(coldLaunch.map((frame) => frame.slot), ["hidden", "strip"]);
  assert.deepEqual(coldLaunch.map((frame) => frame.control), ["none", "toolbar"]);
  assert.deepEqual(coldLaunch.map((frame) => frame.headerShown), [false, true]);
  assert.equal(coldLaunch.some((frame) => frame.slot === "top-bar"), false);

  const unfold = [folded, unfolded].map((state) => chrome(state));
  assert.deepEqual(unfold.map((frame) => frame.headerShown), [true, true]);
  assert.deepEqual(unfold.map((frame) => frame.control), ["toolbar", "toolbar"]);
  assert.deepEqual(unfold.map((frame) => frame.slot), ["top-bar", "strip"]);
});

test("one edge event resolves the header in a single step", () => {
  const edgeListeners = new Set<(event: { edge?: string | null }) => void>();
  const statusBar: StatusBarModule = {
    addListener(_eventName, listener) {
      edgeListeners.add(listener);
      return { remove: () => { edgeListeners.delete(listener); } };
    },
  };
  const store = createStripStore({
    appState: { addEventListener: () => ({ remove() {} }) },
    os: "ios",
    schedule: () => () => {},
    statusBar,
    version: "27.1",
  });
  const seen: TabRootChrome[] = [];
  store.subscribe(() => {
    seen.push(tabRootChrome(store.getState(), signedIn));
  });

  assert.equal(tabRootChrome(store.getState(), signedIn).control, "none");
  for (const listener of edgeListeners) listener({ edge: "leading" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.slot, "strip");
  assert.equal(seen[0]?.control, "toolbar");
  assert.equal(seen[0]?.headerShown, true);

  for (const listener of edgeListeners) listener({ edge: null });
  for (const listener of edgeListeners) listener({ edge: "trailing" });
  assert.deepEqual(seen.map((frame) => frame.slot), ["strip", "top-bar", "strip"]);
  assert.deepEqual(seen.map((frame) => frame.headerShown), [true, true, true]);
  assert.deepEqual(seen.map((frame) => frame.control), ["toolbar", "toolbar", "toolbar"]);
});

test("web and Android use one 44pt header button and iOS keeps the toolbar", () => {
  const state: StripState = { status: "unsupported", edge: null };
  assert.equal(tabRootHeaderButtonDiameter, size.hit);
  assert.equal(tabRootHeaderButtonDiameter, roundIconDiameter);
  assert.equal(tabRootHeaderButtonDiameter, 44);

  for (const platform of ["web", "android"]) {
    const header = chrome(state, platform);
    assert.equal(header.headerShown, true);
    assert.equal(header.slot, "top-bar");
    assert.equal(header.control, "header-button");
  }

  const ios = chrome({ status: "known", edge: null });
  assert.equal(ios.control, "toolbar");
  assert.equal(ios.slot, "top-bar");

  for (const platform of ["ios", "android", "web"]) {
    const frame = chrome({ status: "known", edge: "leading" }, platform);
    const controls = Number(frame.control === "toolbar") + Number(frame.control === "header-button");
    assert.equal(controls, frame.slot === "hidden" ? 0 : 1);
  }
});

test("web tabs use one icon set and the Profile label", () => {
  assert.equal(webTabIconName("(home)"), "house");
  assert.equal(webTabIconName("community"), "person.2");
  assert.equal(webTabIconName("profile"), "person.crop.circle");
  assert.equal(new Set(["house", "person.2", "person.crop.circle"]).size, 3);

  const web = readFileSync(new URL("../app/(tabs)/_layout.web.tsx", import.meta.url), "utf8");
  const native = readFileSync(new URL("../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
  const icons = readFileSync(new URL("./icons.tsx", import.meta.url), "utf8");
  assert.equal(icons.includes('house: "home"'), true);
  assert.equal(icons.includes('"person.2": "users"'), true);
  assert.equal(icons.includes('"person.crop.circle": "user"'), true);
  assert.equal(web.includes("FontAwesome"), false);
  assert.equal(web.includes("Feather"), false);
  assert.equal(web.includes("⌂"), false);
  assert.equal(web.includes("webTabIconName"), true);
  assert.equal(web.includes('title: "Profile"'), true);
  assert.equal(web.includes('"Me"'), false);
  assert.equal(native.includes(">Profile<"), true);
  assert.equal(native.includes(">Me<"), false);
});

test("Log a workout is the header control and the pill is gone", () => {
  const mobileRoot = new URL("..", import.meta.url);
  assert.equal(existsSync(new URL("./rep-in-pill.tsx", import.meta.url)), false);

  const files = sourceFiles(mobileRoot);
  const offenders = files.filter((file) => {
    const code = readFileSync(file, "utf8");
    return code.includes("RepInPill") || code.includes("rep-in-pill");
  });
  assert.deepEqual(offenders, []);

  const stack = readFileSync(new URL("./tab-root-stack.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("./tab-root-header.ts", import.meta.url), "utf8");
  const edge = readFileSync(new URL("./vertical-bar-edge.tsx", import.meta.url), "utf8");
  for (const source of [stack, header, edge]) {
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
  assert.equal(stack.includes("useStripState"), true);
  assert.equal(stack.includes("tabRootChrome"), true);
  assert.equal(stack.includes("Rep in"), false);
  assert.equal(stack.includes('accessibilityLabel="Log a workout"'), true);
  assert.match(stack, />\s*Log a workout\s*</);
  assert.equal(stack.includes("useStripPresent"), false);
  assert.equal(stack.includes("headerShown: stripPresent"), false);
  assert.equal(stack.includes("chrome.headerShown"), true);
  assert.equal(stack.includes('chrome.control === "toolbar"'), true);
  assert.equal(stack.includes('chrome.control === "header-button"'), true);
  assert.equal(edge.includes("useSyncExternalStore"), true);
});

function sourceFiles(root: URL): string[] {
  const files: string[] = [];
  const skip = new Set(["node_modules", "dist", ".expo"]);
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const path = join(dir, entry);
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".test.ts")) files.push(path);
    }
  };
  visit(join(root.pathname, "app"));
  visit(join(root.pathname, "ui"));
  return files;
}
