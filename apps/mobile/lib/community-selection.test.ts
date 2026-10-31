import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  communityFoldTransition,
  communitySelectionClears,
  newestWorkoutId,
  readCommunityPostParam,
  resolveCommunitySelection,
} from "./community-selection";

const older = {
  id: "older",
  occurredAt: "2026-10-30T11:00:00.000Z",
  updatedAt: "2026-10-30T11:00:00.000Z",
};
const newer = {
  id: "newer",
  occurredAt: "2026-10-30T15:00:00.000Z",
  updatedAt: "2026-10-30T15:00:00.000Z",
};

test("no param auto-selects the newest post of the day", () => {
  const selection = resolveCommunitySelection({
    postParam: null,
    workouts: [older, newer],
  });
  assert.deepEqual(selection, { kind: "auto", sessionId: "newer" });
  assert.equal(newestWorkoutId([older, newer]), "newer");
});

test("list order does not decide the newest post", () => {
  const selection = resolveCommunitySelection({
    postParam: null,
    workouts: [newer, older],
  });
  assert.equal(selection.kind, "auto");
  if (selection.kind === "auto") assert.equal(selection.sessionId, "newer");
});

test("a post param is an explicit selection, even when it is not in the feed", () => {
  assert.deepEqual(
    resolveCommunitySelection({ postParam: "older", workouts: [older, newer] }),
    { kind: "explicit", sessionId: "older" },
  );
  assert.deepEqual(
    resolveCommunitySelection({ postParam: "deep-link", workouts: [newer] }),
    { kind: "explicit", sessionId: "deep-link" },
  );
});

test("blank params are treated as no selection", () => {
  assert.equal(readCommunityPostParam(""), null);
  assert.equal(readCommunityPostParam("  "), null);
  assert.equal(readCommunityPostParam(["", "ignored"]), null);
  assert.equal(readCommunityPostParam(" session-1 "), "session-1");
  const selection = resolveCommunitySelection({
    postParam: readCommunityPostParam(""),
    workouts: [newer],
  });
  assert.equal(selection.kind, "auto");
});

test("no posts and no param is an empty selection", () => {
  assert.deepEqual(resolveCommunitySelection({ postParam: null, workouts: [] }), { kind: "none" });
});

test("changing group or day clears the selection back to auto", () => {
  assert.equal(communitySelectionClears({
    nextDayKey: "2026-10-30",
    nextGroupId: "crew-b",
    previousDayKey: "2026-10-30",
    previousGroupId: "crew-a",
  }), true);
  assert.equal(communitySelectionClears({
    nextDayKey: "2026-10-29",
    nextGroupId: "crew-a",
    previousDayKey: "2026-10-30",
    previousGroupId: "crew-a",
  }), true);
  assert.equal(communitySelectionClears({
    nextDayKey: "2026-10-30",
    nextGroupId: "crew-a",
    previousDayKey: "2026-10-30",
    previousGroupId: "crew-a",
  }), false);
});

test("folding an explicit two-pane selection opens the same post", () => {
  assert.deepEqual(communityFoldTransition({
    modalSessionId: null,
    nextMode: "compact",
    previousMode: "twoPane",
    selection: { kind: "explicit", sessionId: "newer" },
  }), {
    closeModalImmediately: false,
    openModalSessionId: "newer",
    setExplicitPostId: null,
  });
  assert.deepEqual(communityFoldTransition({
    modalSessionId: null,
    nextMode: "wide",
    previousMode: "twoPane",
    selection: { kind: "explicit", sessionId: "newer" },
  }).openModalSessionId, "newer");
});

test("folding an auto selection shows the feed only", () => {
  assert.deepEqual(communityFoldTransition({
    modalSessionId: null,
    nextMode: "compact",
    previousMode: "twoPane",
    selection: { kind: "auto", sessionId: "newer" },
  }), {
    closeModalImmediately: false,
    openModalSessionId: null,
    setExplicitPostId: null,
  });
  assert.equal(communityFoldTransition({
    modalSessionId: null,
    nextMode: "compact",
    previousMode: "twoPane",
    selection: { kind: "none" },
  }).openModalSessionId, null);
});

test("unfolding an open sheet makes the selection explicit and closes the sheet", () => {
  assert.deepEqual(communityFoldTransition({
    modalSessionId: "newer",
    nextMode: "twoPane",
    previousMode: "compact",
    selection: { kind: "auto", sessionId: "older" },
  }), {
    closeModalImmediately: true,
    openModalSessionId: null,
    setExplicitPostId: "newer",
  });
  assert.equal(communityFoldTransition({
    modalSessionId: "newer",
    nextMode: "twoPane",
    previousMode: "wide",
    selection: { kind: "none" },
  }).setExplicitPostId, "newer");
});

test("unfolding with no sheet keeps the auto selection", () => {
  assert.deepEqual(communityFoldTransition({
    modalSessionId: null,
    nextMode: "twoPane",
    previousMode: "compact",
    selection: { kind: "auto", sessionId: "newer" },
  }), {
    closeModalImmediately: false,
    openModalSessionId: null,
    setExplicitPostId: null,
  });
});

test("compact and wide do not retarget each other", () => {
  assert.deepEqual(communityFoldTransition({
    modalSessionId: "newer",
    nextMode: "wide",
    previousMode: "compact",
    selection: { kind: "explicit", sessionId: "newer" },
  }), {
    closeModalImmediately: false,
    openModalSessionId: null,
    setExplicitPostId: null,
  });
});
