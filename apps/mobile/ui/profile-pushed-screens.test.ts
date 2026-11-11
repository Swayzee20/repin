import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createElement, type ComponentType, type ReactElement } from "react";

import { MainTabsProvider, useMainTabs, useMainTabsIfPresent } from "./main-tabs-context";

/* eslint-disable @typescript-eslint/no-floating-promises */

type EsbuildPluginBuild = {
  onLoad: (options: { filter: RegExp }, callback: () => { contents: string; loader: "js" }) => void;
  onResolve: (
    options: { filter: RegExp },
    callback: (args: { path: string }) => { external?: boolean; path: string } | null,
  ) => void;
};

type EsbuildApi = {
  build: (options: {
    absWorkingDir: string;
    bundle: boolean;
    entryPoints: string[];
    format: "esm";
    jsx: "automatic";
    logLevel: "silent";
    platform: "neutral";
    plugins: { name: string; setup: (build: EsbuildPluginBuild) => void }[];
    write: false;
  }) => Promise<{ outputFiles: { text: string }[] }>;
};

const require = createRequire(import.meta.url);
const esbuild = require(createRequire(require.resolve("tsx")).resolve("esbuild")) as EsbuildApi;
const renderToStaticMarkup = (
  require("react-dom/server") as { renderToStaticMarkup: (element: ReactElement) => string }
).renderToStaticMarkup;
const here = dirname(fileURLToPath(import.meta.url));
const stubPath = fileURLToPath(new URL("./profile-screen-test-stubs.mjs", import.meta.url));
const contextPath = fileURLToPath(new URL("./main-tabs-context.tsx", import.meta.url));

function sourceOf(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function shouldStub(specifier: string) {
  return (
    specifier === "expo" ||
    specifier === "react-native" ||
    specifier.startsWith("react-native/") ||
    specifier.startsWith("react-native-") ||
    specifier.startsWith("expo-") ||
    specifier.startsWith("@expo/") ||
    specifier.startsWith("@expo-google-fonts/") ||
    specifier.startsWith("@react-native-community/") ||
    specifier.startsWith("@supabase/") ||
    specifier === "@sentry/react-native"
  );
}

function externalPackage(specifier: string) {
  return { external: true as const, path: require.resolve(specifier) };
}

async function loadScreen(entry: string): Promise<ComponentType> {
  const result = await esbuild.build({
    absWorkingDir: join(here, ".."),
    bundle: true,
    entryPoints: [entry],
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
    platform: "neutral",
    plugins: [
      {
        name: "stub-native-modules",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (shouldStub(args.path)) return { path: stubPath };
            if (args.path.includes("main-tabs-context")) {
              return { external: true, path: contextPath };
            }
            if (args.path === "react" || args.path.startsWith("react/")) return externalPackage(args.path);
            if (args.path === "react-dom" || args.path.startsWith("react-dom/")) return externalPackage(args.path);
            return null;
          });
          build.onLoad({ filter: /\.(png|jpg|jpeg|gif|webp)$/ }, () => ({
            contents: "export default \"\";",
            loader: "js",
          }));
        },
      },
    ],
    write: false,
  });
  const file = result.outputFiles[0];
  if (!file?.text) throw new Error(`esbuild produced no output for ${entry}`);
  const dir = await mkdtemp(join(tmpdir(), "profile-screens-"));
  const outFile = join(dir, "screen.mjs");
  await writeFile(outFile, file.text);
  const mod = await import(pathToFileURL(outFile).href) as { default: ComponentType };
  return mod.default;
}

function renderScreen(Screen: ComponentType) {
  return renderToStaticMarkup(createElement(Screen));
}

test("history, workout detail, and bests render without MainTabsProvider", async () => {
  const HistoryScreen = await loadScreen("app/history/index.tsx");
  const DetailScreen = await loadScreen("app/history/[sessionId].tsx");
  const BestsScreen = await loadScreen("app/bests/index.tsx");

  assert.doesNotThrow(() => renderScreen(HistoryScreen));
  assert.doesNotThrow(() => renderScreen(DetailScreen));
  assert.doesNotThrow(() => renderScreen(BestsScreen));
});

test("history and bests still render inside MainTabsProvider", async () => {
  const HistoryScreen = await loadScreen("app/history/index.tsx");
  const BestsScreen = await loadScreen("app/bests/index.tsx");

  assert.doesNotThrow(() => {
    renderToStaticMarkup(createElement(MainTabsProvider, null, createElement(HistoryScreen)));
  });
  assert.doesNotThrow(() => {
    renderToStaticMarkup(createElement(MainTabsProvider, null, createElement(BestsScreen)));
  });
});

test("useMainTabs still requires the provider; useMainTabsIfPresent does not", () => {
  function Required() {
    useMainTabs();
    return createElement("div");
  }
  function Optional() {
    const tabs = useMainTabsIfPresent();
    return createElement("div", null, tabs ? "present" : "missing");
  }

  assert.throws(() => renderToStaticMarkup(createElement(Required)), /useMainTabs must be used within MainTabsProvider/);
  assert.equal(renderToStaticMarkup(createElement(Optional)), "<div>missing</div>");
  assert.equal(
    renderToStaticMarkup(createElement(MainTabsProvider, null, createElement(Optional))),
    "<div>present</div>",
  );
});

test("pushed profile screens keep real strip state and do not throw on a missing provider", () => {
  const history = sourceOf("../app/history/index.tsx");
  const bests = sourceOf("../app/bests/index.tsx");
  const detail = sourceOf("../app/history/[sessionId].tsx");

  for (const code of [history, bests]) {
    assert.match(code, /useMainTabsIfPresent/);
    assert.equal(code.includes("useMainTabs("), false);
    assert.match(code, /useStripState/);
    assert.match(code, /tabs\?\.selectedGroupId/);
    assert.match(code, /tabs\?\.toggleWorkoutChooser/);
    assert.match(code, /pushedHeaderScreenOptions/);
    assert.equal(code.includes("getVerticalBarEdge("), false);
  }

  assert.equal(detail.includes("useMainTabs"), false);
  assert.match(detail, /useStripState/);
  assert.match(detail, /pushedHeaderScreenOptions/);
  assert.equal(detail.includes("getVerticalBarEdge("), false);
});

test("the chooser host lives at the root so pushed screens can open plus", () => {
  const root = sourceOf("../app/_layout.tsx");
  const nativeTabs = sourceOf("../app/(tabs)/_layout.tsx");
  const webTabs = sourceOf("../app/(tabs)/_layout.web.tsx");
  const host = sourceOf("./workout-chooser-host.tsx");

  assert.match(root, /<MainTabsProvider>/);
  assert.match(root, /<WorkoutChooserHost \/>/);
  assert.equal(nativeTabs.includes("MainTabsProvider"), false);
  assert.equal(webTabs.includes("MainTabsProvider"), false);
  assert.match(nativeTabs, /<MainTabsGate>/);
  assert.match(webTabs, /<MainTabsGate>/);
  assert.match(host, /useMainTabsIfPresent/);
  assert.match(host, /LogWorkoutChooser/);
});

test("every outside-tabs screen that used the crashy hooks is covered", () => {
  const outsideTabs = [
    "../app/bests/index.tsx",
    "../app/blocked-accounts.tsx",
    "../app/goals/[id]/index.tsx",
    "../app/goals/history.tsx",
    "../app/groups/[id].tsx",
    "../app/groups/join.tsx",
    "../app/history/[sessionId].tsx",
    "../app/history/index.tsx",
    "../app/settings.tsx",
  ];

  for (const path of outsideTabs) {
    const code = sourceOf(path);
    assert.equal(code.includes("getVerticalBarEdge("), false, path);
    if (code.includes("useMainTabs(")) {
      assert.match(code, /useMainTabsIfPresent/, path);
    }
  }

  const required = sourceOf("./tab-root-stack.tsx");
  assert.match(required, /useMainTabs\(\)/);
  assert.equal(required.includes("useMainTabsIfPresent"), false);
});
