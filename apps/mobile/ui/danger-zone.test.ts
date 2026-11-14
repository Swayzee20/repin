import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  DANGER_DELETION_LIST,
  DANGER_FAILED,
  DANGER_PREVIEW_FAILED,
  DANGER_PREVIEW_LOADING,
  DANGER_WARNING,
  DANGER_WRONG_PASSWORD,
  DELETE_CONFIRMATION,
  HANDOVER_COLLAPSED_COUNT,
  handoverOutcome,
  handoverRowLabel,
  type DeletionPreviewCrew,
} from "./danger-zone-copy";
import { OWNER_NOTICE_ACTION, OWNER_NOTICE_BODY } from "./notice-banner-copy";

test("danger zone copy matches the approved spec", () => {
  assert.equal(DANGER_WARNING, "This happens right away and can't be undone.");
  assert.match(DANGER_DELETION_LIST, /every crew/);
  assert.equal(DANGER_WRONG_PASSWORD, "Wrong password. Try again.");
  assert.equal(DANGER_FAILED, "Couldn't delete your account. Try again.");
  assert.equal(DANGER_PREVIEW_LOADING, "Loading your crews…");
  assert.equal(DANGER_PREVIEW_FAILED, "Couldn't load your crews. Retry.");
  assert.equal(DELETE_CONFIRMATION, "DELETE");
  assert.equal(HANDOVER_COLLAPSED_COUNT, 4);
  assert.equal(DANGER_WARNING.toLowerCase().includes("group"), false);
  assert.equal(DANGER_DELETION_LIST.toLowerCase().includes("group"), false);
});

test("handover rows name the successor or that the crew closes", () => {
  const transfer: DeletionPreviewCrew = {
    groupId: "1",
    name: "Morning Run",
    closes: false,
    successorDisplayName: "Sam R.",
  };
  const closing: DeletionPreviewCrew = {
    groupId: "2",
    name: "Track Crew",
    closes: true,
    successorDisplayName: null,
  };
  assert.equal(handoverOutcome(transfer), "Sam R. becomes owner");
  assert.equal(handoverRowLabel(transfer), "Morning Run, Sam R. becomes owner.");
  assert.equal(handoverOutcome(closing), "Closes, no other members");
  assert.equal(handoverRowLabel(closing), "Track Crew, Closes, no other members.");
});

test("owner notice never names the deleted person", () => {
  assert.equal(
    OWNER_NOTICE_BODY,
    "A member deleted their account, so you're now this crew's owner.",
  );
  assert.equal(OWNER_NOTICE_ACTION, "View owner tools");
  assert.equal(OWNER_NOTICE_BODY.includes("group"), false);
  assert.equal(/[A-Z][a-z]+ [A-Z]\./.test(OWNER_NOTICE_BODY), false);
});
