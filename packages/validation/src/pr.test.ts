import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  answerPrPromptsSchema,
  restorePrBadgesSchema,
  shareSessionPrsSchema,
} from "./pr";

test("PR write payloads require owned keys and reject extras", () => {
  const answers = answerPrPromptsSchema.parse({
    answers: [{ confirmed: true, key: "hs:name:back squat", kind: "heaviest_single" }],
  });
  assert.equal(answers.answers[0]?.confirmed, true);
  assert.equal(shareSessionPrsSchema.parse({}).keys, undefined);
  const restored = restorePrBadgesSchema.parse({
    badges: [{ key: "dt:run:5k", kind: "distance_time" }],
  });
  assert.equal(restored.badges.length, 1);
  assert.equal(answerPrPromptsSchema.safeParse({ answers: [] }).success, false);
  assert.equal(
    answerPrPromptsSchema.safeParse({
      answers: [{ confirmed: true, key: "hs:x", kind: "heaviest_single", extra: true }],
    }).success,
    false,
  );
});
