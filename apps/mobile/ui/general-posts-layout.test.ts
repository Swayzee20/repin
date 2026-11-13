import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("Community drops the day stepper and keeps New post above the pin slot", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  assert.match(community, /generalPostCopy\.newPost/);
  assert.match(community, /variant="tonal"/);
  assert.match(community, /labelColor=\{colors\.brandPressed\}/);
  assert.match(community, /isPinned/);
  assert.equal(community.includes("CommunityDatePicker"), false);
  assert.equal(community.includes("onOpenDatePicker"), false);
  assert.equal(community.includes("formatCommunityDayLabel"), false);
  assert.equal(community.includes("compactDay"), false);
  assert.equal(community.includes('position: "sticky"'), false);
  assert.equal(community.includes("destinationCrewNames"), false);
  assert.match(community, /generalPostCopy\.loadErrorTitle/);
});

test("plus chooser stays Quick Log and Detailed Workout only", () => {
  const chooser = source("./log-workout-chooser.tsx");
  assert.match(chooser, /title="Log a workout"/);
  assert.equal((chooser.match(/title: "Quick Log"/g) ?? []).length, 1);
  assert.equal((chooser.match(/title: "Detailed Workout"/g) ?? []).length, 1);
  assert.equal(chooser.includes("New post"), false);
  assert.equal(chooser.includes('key: "post"'), false);
  assert.match(chooser, /workoutLogOptions: readonly[\s\S]*key: "quick" \| "detailed"/);
});

test("composer copy, disabled helpers, and Duo trailing pane match the SPEC", () => {
  const composer = source("./general-post-composer.tsx");
  assert.match(composer, /generalPostDisabledReason/);
  assert.match(composer, /disabledReason=\{helper/);
  assert.match(composer, /formatCharacterCounter/);
  assert.match(composer, /GENERAL_POST_BODY_MAX/);
  assert.match(composer, /Photos/);
  assert.match(composer, /CrewPickerPane/);
  assert.match(composer, /twoPane/);
  assert.match(composer, /generalPostCopy\.postedTo/);
  assert.match(composer, /generalPostCopy\.crewsLocked/);
  assert.equal(composer.includes("Post to groups"), false);
  assert.equal(composer.includes("Choose groups"), false);
});

test("cards never list other destination crews and pin slot is not sticky", () => {
  const card = source("./general-post-card.tsx");
  assert.equal(card.includes("destinationCrewNames"), false);
  assert.equal(card.includes("Posted to"), false);
  assert.match(card, /pinEyebrow/);
  assert.equal(card.includes('position: "sticky"'), false);
  assert.match(card, /generalPostCopy\.typePill/);
  assert.match(card, /OwnPostYouTag/);
  assert.match(card, /isOwn \? <OwnPostYouTag \/> : null/);
  assert.equal(card.includes("ownPostMarkerStyle"), false);
  assert.equal(card.includes("ownEdge"), false);
  assert.equal(card.includes("Your post"), false);
  assert.equal(card.includes("ownPostVoiceOverLabel"), false);
});

test("general post card labels do not add Your post because the You tag is visible", () => {
  const card = source("./general-post-card.tsx");
  assert.match(card, /export \{ generalPostFeedCardLabel \}/);
  assert.equal(card.includes("Your post"), false);
  assert.equal(card.includes("ownPostVoiceOverLabel"), false);

  const detail = source("./general-post-detail.tsx");
  assert.match(detail, /viewerUserId=\{viewerUserId\}/);
});

test("notifications sheet leads with New posts from your crew", () => {
  const sheets = source("./crew-sheets.tsx");
  const alerts = sheets.slice(sheets.indexOf("ALERTS"));
  assert.ok(alerts.indexOf("New posts from your crew") < alerts.indexOf("New workouts from your crew"));
  assert.match(sheets, /crewPost: false/);
});
