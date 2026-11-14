import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { crewPickerViewState } from "./crew-picker-state";

/* eslint-disable @typescript-eslint/no-floating-promises */

test("crew picker view is loading while a fetch is in flight", () => {
  assert.equal(
    crewPickerViewState({ loading: true, error: null, groupCount: 0 }),
    "loading",
  );
  assert.equal(
    crewPickerViewState({ loading: true, error: "Request failed (500)", groupCount: 0 }),
    "loading",
  );
  assert.equal(
    crewPickerViewState({ loading: true, error: null, groupCount: 2 }),
    "loading",
  );
});

test("a failed fetch is an error even when the list is empty", () => {
  assert.equal(
    crewPickerViewState({ loading: false, error: "Request failed (404)", groupCount: 0 }),
    "error",
  );
  assert.equal(
    crewPickerViewState({ loading: false, error: "Couldn't load your crews.", groupCount: 3 }),
    "error",
  );
});

test("empty is only a successful fetch that returned zero crews", () => {
  assert.equal(
    crewPickerViewState({ loading: false, error: null, groupCount: 0 }),
    "empty",
  );
  assert.equal(
    crewPickerViewState({ loading: false, error: undefined, groupCount: 0 }),
    "empty",
  );
});

test("a successful fetch with crews shows the list", () => {
  assert.equal(
    crewPickerViewState({ loading: false, error: null, groupCount: 1 }),
    "list",
  );
});

test("the composer never uses group-count empty as the failed-fetch path", () => {
  const composer = readFileSync(new URL("../ui/general-post-composer.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../app/groups/[id]/new-post.tsx", import.meta.url), "utf8");
  assert.match(composer, /crewPickerViewState/);
  assert.match(composer, /view === "empty"/);
  assert.equal(composer.includes("if (!groups.length)"), false);
  assert.match(composer, /StateCard/);
  assert.match(composer, /LoadingState/);
  assert.match(composer, /generalPostCopy\.pickerLoadErrorTitle/);
  assert.match(composer, /generalPostCopy\.tryAgain/);
  assert.match(composer, /generalPostCopy\.pickerEmpty/);
  assert.match(screen, /apiRequest/);
  assert.match(screen, /onRetryGroups/);
  assert.match(screen, /groupsLoading/);
  assert.match(screen, /groupsError/);
});
