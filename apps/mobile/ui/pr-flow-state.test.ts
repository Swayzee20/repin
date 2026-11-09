import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import type { DetectedPr, PrDetectionResult } from "@repin/types";

import {
  hideThenPresent,
  initialPrFlowState,
  reducePrFlow,
  type PrFlowState,
} from "./pr-flow-state";
import { prCopy } from "./pr-copy";

const detected: DetectedPr = {
  autoDetected: true,
  delta: "+5 lb",
  key: "back_squat:1",
  kind: "heaviest_single",
  label: "Back squat",
  value: "225 lb",
};

function detection(overrides: Partial<PrDetectionResult> = {}): PrDetectionResult {
  return {
    communityPostId: "post-1",
    crewName: "Sunrise",
    detected: [detected],
    prompts: [],
    ...overrides,
  };
}

function celebrate(hasPost = true) {
  return initialPrFlowState(detection({
    communityPostId: hasPost ? "post-1" : null,
    crewName: hasPost ? "Sunrise" : null,
  }));
}

function continueToShare(state: PrFlowState) {
  const hidden = reducePrFlow(state, { hasCommunityPost: true, type: "continueCelebration" });
  return reducePrFlow(hidden, { type: "presenterHidden" });
}

test("Continue with a crew post hides the celebration modal before the share sheet", () => {
  const celebrating = celebrate(true);
  assert.equal(celebrating.presenter, "celebration");

  const afterContinue = reducePrFlow(celebrating, {
    hasCommunityPost: true,
    type: "continueCelebration",
  });
  assert.equal(afterContinue.presenter, "none");
  assert.equal(afterContinue.pendingPresenter, "share");
  assert.equal(afterContinue.finished, false);
  assert.notEqual(afterContinue.presenter, afterContinue.pendingPresenter);

  const afterHidden = reducePrFlow(afterContinue, { type: "presenterHidden" });
  assert.equal(afterHidden.presenter, "share");
  assert.equal(afterHidden.pendingPresenter, "none");
  assert.equal(afterHidden.finished, false);
});

test("Continue without a crew post closes with the private-save notice instead of a dead button", () => {
  const afterContinue = reducePrFlow(celebrate(false), {
    hasCommunityPost: false,
    type: "continueCelebration",
  });
  assert.equal(afterContinue.presenter, "none");
  assert.equal(afterContinue.pendingPresenter, "none");
  assert.equal(afterContinue.finished, true);
  assert.equal(afterContinue.notice, "no_post");
  assert.equal(prCopy.noPostHelper.length > 0, true);
  assert.equal(prCopy.noPostPrimary, "Done");
});

test("a share API error stays on the share step and surfaces the message", () => {
  const sharing = continueToShare(celebrate(true));
  const started = reducePrFlow(sharing, { type: "shareStarted" });
  assert.equal(started.busy, true);
  assert.equal(started.error, null);

  const failed = reducePrFlow(started, {
    message: "PR badge could not be shared.",
    type: "shareFailed",
  });
  assert.equal(failed.busy, false);
  assert.equal(failed.finished, false);
  assert.equal(failed.presenter, "share");
  assert.equal(failed.error, "PR badge could not be shared.");

  const retry = reducePrFlow(failed, { type: "shareStarted" });
  assert.equal(retry.error, null);
  const succeeded = reducePrFlow(retry, { type: "shareSucceeded" });
  assert.equal(succeeded.finished, true);
  assert.equal(succeeded.presenter, "none");
  assert.equal(succeeded.error, null);
});

test("hideThenPresent never leaves two RN presenters visible in one state", () => {
  const celebrating = celebrate(true);
  const queued = hideThenPresent(celebrating, "share");
  assert.equal(queued.presenter, "none");
  assert.equal(queued.pendingPresenter, "share");
  assert.notEqual(queued.presenter, queued.pendingPresenter);

  const idleShare = hideThenPresent({
    ...celebrating,
    presenter: "none",
  }, "share");
  assert.equal(idleShare.presenter, "share");
  assert.equal(idleShare.pendingPresenter, "none");
});

test("a late presenterHidden after the share sheet is up does not finish or reopen celebration", () => {
  const sharing = continueToShare(celebrate(true));
  const extra = reducePrFlow(sharing, { type: "presenterHidden" });
  assert.deepEqual(extra, sharing);
});

test("a second Continue while the celebration modal is hiding does not present the share sheet early", () => {
  const afterContinue = reducePrFlow(celebrate(true), {
    hasCommunityPost: true,
    type: "continueCelebration",
  });
  const again = reducePrFlow(afterContinue, {
    hasCommunityPost: true,
    type: "continueCelebration",
  });
  assert.deepEqual(again, afterContinue);
  assert.equal(again.presenter, "none");
  assert.equal(again.pendingPresenter, "share");
});

test("the last prompt answer hides the prompt sheet before the celebration modal", () => {
  const prompting = initialPrFlowState(detection({
    detected: [],
    prompts: [{
      intro: "one_rep",
      key: "back_squat:1",
      kind: "heaviest_single",
      resultLine: "225 lb",
      title: "Back squat",
    }],
  }));
  assert.equal(prompting.presenter, "prompt");
  const answered = reducePrFlow(prompting, {
    hasMorePrompts: false,
    merged: [detected],
    type: "promptAnswered",
  });
  assert.equal(answered.presenter, "none");
  assert.equal(answered.pendingPresenter, "celebration");
  const shown = reducePrFlow(answered, { type: "presenterHidden" });
  assert.equal(shown.presenter, "celebration");
  assert.equal(shown.pendingPresenter, "none");
});

test("PR overlay waits for Dialog onHidden and never keeps the celebration Modal up during share", () => {
  const flow = readFileSync(new URL("pr-flow.tsx", import.meta.url), "utf8");
  assert.match(flow, /reducePrFlow/);
  assert.match(flow, /type: "continueCelebration"/);
  assert.match(flow, /type: "presenterHidden"/);
  assert.match(flow, /onHidden=\{presenterHidden\}/);
  assert.match(flow, /visible=\{state\.presenter === "celebration"\}/);
  assert.match(flow, /visible=\{state\.presenter === "share"\}/);
  assert.equal(flow.includes("step === \"celebration\" || step === \"share\""), false);
  assert.equal(flow.includes("celebrationVisible && !promptVisible"), false);
  assert.equal(flow.includes("setStep(\"share\")"), false);

  const api = readFileSync(new URL("../lib/pr-api.ts", import.meta.url), "utf8");
  assert.match(api, /if \(!response\.ok\)/);
  assert.match(api, /body\.prBadges\?\.length/);
  assert.match(api, /PR badge could not be shared/);
});
