import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  createGeneralPostSchema,
  extractPublicationUrls,
  formatCharacterCounter,
  formatDeletePostBody,
  formatEmptyBoard,
  formatPinBody,
  formatPostedTo,
  formatPostToCrews,
  formatReplacePinBody,
  GENERAL_POST_BODY_MAX,
  generalPostCopy,
  generalPostDisabledReason,
  generalPostHasContent,
  isGeneralPostPhotoPath,
  shouldShowCharacterCounter,
} from "./general-posts";

test("general post copy matches the locked SPEC", () => {
  assert.equal(generalPostCopy.newPost, "New post");
  assert.equal(generalPostCopy.editPost, "Edit post");
  assert.equal(generalPostCopy.emptyHelper, "Write something or add a photo to post.");
  assert.equal(generalPostCopy.shorten, "Shorten your post to 2,000 characters.");
  assert.equal(generalPostCopy.waitForUploads, "Wait for every photo to finish uploading.");
  assert.equal(generalPostCopy.chooseCrews, "Choose crews");
  assert.equal(generalPostCopy.crewsLocked, "Crews can't be changed after you post.");
  assert.equal(
    generalPostCopy.pickerIntro,
    "Pick 1 to 10 crews. Crews can't be changed after you post.",
  );
  assert.equal(generalPostCopy.pickerLimit, "You can post to 10 crews at a time.");
  assert.equal(
    generalPostCopy.pickerEmpty,
    "You're not in a crew yet. Join or create a crew to post.",
  );
  assert.equal(generalPostCopy.loadErrorTitle, "Couldn't load the board");
  assert.equal(generalPostCopy.offline, "You're offline. Showing what we have.");
  assert.equal(generalPostCopy.postFailed, "Couldn't post. Try again.");
  assert.equal(generalPostCopy.deleteTitle, "Delete post from all crews?");
  assert.equal(generalPostCopy.deleteAction, "Delete post");
  assert.equal(generalPostCopy.pinTitle, "Pin this post?");
  assert.equal(generalPostCopy.pinAction, "Pin post");
  assert.equal(generalPostCopy.replacePinTitle, "Replace current pin?");
  assert.equal(generalPostCopy.replacePinAction, "Replace pin");
  assert.equal(generalPostCopy.unpinToast, "Post unpinned.");
  assert.equal(generalPostCopy.newPostsToggle, "New posts from your crew");
  assert.equal(generalPostCopy.plusChooserTitle, "Log a workout");
  assert.equal(
    formatEmptyBoard("Morning Crew"),
    "No posts yet. Be the first to share with Morning Crew.",
  );
  assert.equal(
    formatDeletePostBody(["Morning Crew", "Track Club"]),
    "This removes the post from Morning Crew and Track Club. Comments and reactions in those crews are deleted too. This cannot be undone.",
  );
  assert.equal(
    formatPinBody("Morning Crew"),
    "It stays at the top of Morning Crew's board. You can pin one post at a time in this crew.",
  );
  assert.equal(
    formatReplacePinBody("Morning Crew"),
    "This takes the place of the post that's pinned now on Morning Crew's board.",
  );
  assert.equal(formatPostToCrews([]), "Choose crews");
  assert.equal(formatPostToCrews(["Morning Crew"]), "Post to Morning Crew");
  assert.equal(
    formatPostToCrews(["Morning Crew", "Track Club"]),
    "Post to Morning Crew and Track Club",
  );
  assert.equal(formatPostedTo(["Morning Crew", "Track Club"]), "Morning Crew and Track Club");
});

test("composer helpers gate empty, over-limit, and pending uploads", () => {
  assert.equal(generalPostHasContent({ body: "  ", photoCount: 0 }), false);
  assert.equal(generalPostHasContent({ body: "Hi", photoCount: 0 }), true);
  assert.equal(generalPostHasContent({ body: "", photoCount: 1 }), true);
  assert.equal(
    generalPostDisabledReason({ body: "", photoCount: 0, uploading: false, failedUpload: false }),
    generalPostCopy.emptyHelper,
  );
  assert.equal(
    generalPostDisabledReason({
      body: "x".repeat(GENERAL_POST_BODY_MAX + 1),
      photoCount: 0,
      uploading: false,
      failedUpload: false,
    }),
    generalPostCopy.shorten,
  );
  assert.equal(
    generalPostDisabledReason({ body: "Hi", photoCount: 0, uploading: true, failedUpload: false }),
    generalPostCopy.waitForUploads,
  );
  assert.equal(shouldShowCharacterCounter(1799), false);
  assert.equal(shouldShowCharacterCounter(1800), true);
  assert.equal(formatCharacterCounter(1847), "1,847 / 2,000");
  assert.equal(formatCharacterCounter(2012), "2,012 / 2,000");
});

test("create schema requires text or a photo and extracts links from body", () => {
  const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const publicationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.equal(
    createGeneralPostSchema.safeParse({
      publicationId,
      groupIds: [groupId],
      photoIds: [],
    }).success,
    false,
  );
  assert.equal(
    createGeneralPostSchema.safeParse({
      publicationId,
      body: "Thursday track",
      groupIds: [groupId],
      photoIds: [],
    }).success,
    true,
  );
  assert.deepEqual(
    extractPublicationUrls("Meet at maps.app.goo.gl/southgate and https://example.com/path."),
    ["maps.app.goo.gl/southgate", "https://example.com/path"],
  );
  assert.deepEqual(
    extractPublicationUrls("See https://example.com/a and https://example.com/a again"),
    ["https://example.com/a"],
  );
});

test("photo paths stay under the author posts folder", () => {
  const author = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const publication = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const asset = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.equal(
    isGeneralPostPhotoPath(`${author}/posts/${publication}/${asset}.jpg`, author, publication),
    true,
  );
  assert.equal(
    isGeneralPostPhotoPath(`${author}/../secret.jpg`, author, publication),
    false,
  );
});
