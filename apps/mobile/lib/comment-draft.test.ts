import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  clearCommentDraft,
  readCommentDraft,
  resetCommentDrafts,
  writeCommentDraft,
} from "./comment-draft";

test("comment drafts are stored per session", () => {
  resetCommentDrafts();
  writeCommentDraft("session-a", "See you tomorrow.");
  writeCommentDraft("session-b", "Nice work.");
  assert.equal(readCommentDraft("session-a"), "See you tomorrow.");
  assert.equal(readCommentDraft("session-b"), "Nice work.");
  assert.equal(readCommentDraft("session-c"), "");
  writeCommentDraft("session-a", "Updated draft");
  assert.equal(readCommentDraft("session-a"), "Updated draft");
  assert.equal(readCommentDraft("session-b"), "Nice work.");
});

test("a successful post clears only that session's draft", () => {
  resetCommentDrafts();
  writeCommentDraft("session-a", "Keep me");
  writeCommentDraft("session-b", "Post me");
  clearCommentDraft("session-b");
  assert.equal(readCommentDraft("session-a"), "Keep me");
  assert.equal(readCommentDraft("session-b"), "");
});

test("an empty draft is removed", () => {
  resetCommentDrafts();
  writeCommentDraft("session-a", "Hello");
  writeCommentDraft("session-a", "");
  assert.equal(readCommentDraft("session-a"), "");
});
