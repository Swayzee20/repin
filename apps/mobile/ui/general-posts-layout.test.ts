import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { colors, fonts, spacing, type } from "./theme";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("Community drops the day stepper and keeps New post above the pin slot", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  assert.match(community, /generalPostCopy\.newPost/);
  assert.match(community, /variant="compact-primary"/);
  assert.match(community, /icon="pencil"/);
  assert.match(community, /buildCommunityBoardRows/);
  assert.match(community, /CommunityDayDivider/);
  assert.equal(community.includes('variant="tonal"'), false);
  assert.equal(community.includes("labelColor={colors.brandPressed}"), false);
  assert.match(community, /isPinned/);
  assert.equal(community.includes("CommunityDatePicker"), false);
  assert.equal(community.includes("onOpenDatePicker"), false);
  assert.equal(community.includes("formatCommunityDayLabel"), false);
  assert.equal(community.includes("compactDay"), false);
  assert.equal(community.includes("SectionList"), false);
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
  assert.match(composer, /crewPickerViewState/);
  assert.match(composer, /StateCard/);
  assert.match(composer, /LoadingState/);
  assert.match(composer, /generalPostCopy\.pickerLoadErrorTitle/);
  assert.match(composer, /generalPostCopy\.tryAgain/);
  assert.match(composer, /view === "empty"/);
  assert.equal(composer.includes("if (!groups.length)"), false);
  assert.equal(composer.includes("Post to groups"), false);
  assert.equal(composer.includes("Choose groups"), false);
});

test("cards never list other destination crews and pin slot is not sticky", () => {
  const card = source("./general-post-card.tsx");
  assert.equal(card.includes("destinationCrewNames"), false);
  assert.equal(card.includes("Posted to"), false);
  assert.match(card, /pinEyebrow/);
  assert.match(card, /accessibilityRole="header"/);
  assert.match(card, /accessibilityLabel=\{generalPostCopy\.pinEyebrow\}/);
  assert.equal(card.includes('position: "sticky"'), false);
  assert.match(card, /KindChip label=\{generalPostCopy\.typePill\}/);
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

test("day dividers scroll with the feed and are not sticky controls", () => {
  const divider = source("./community-day-divider.tsx");
  const community = source("../app/(tabs)/community/index.tsx");
  assert.match(divider, /accessibilityRole="header"/);
  assert.match(divider, /pointerEvents="none"/);
  assert.match(divider, /colors\.border/);
  assert.match(divider, /type\.label/);
  assert.equal(divider.includes("onPress"), false);
  assert.equal(community.includes("SectionList"), false);
  assert.equal(community.includes('position: "sticky"'), false);
  assert.match(community, /buildCommunityBoardRows/);
  assert.match(community, /formatCommunityPinnedTimestamp/);
});

test("tapping a pinned general post opens the same detail as any other post", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const pinnedPresses = community.match(/onPress=\{\(\) => openGeneralPostDetail\(pinnedPost\)\}/g) ?? [];
  assert.equal(pinnedPresses.length, 2);
  assert.match(community, /resolveCommunityGeneralPost/);
  assert.match(community, /pinnedPost,/);
  assert.match(community, /generalPost=\{detailTarget \? null : generalDetail\}/);
  assert.match(community, /visible=\{detailTarget !== null \|\| generalDetail !== null\}/);
  assert.match(community, /right=\{generalDetail \?/);
  assert.match(community, /presentation="community-pane"/);
  assert.equal(community.includes("openWorkoutDetail(pinnedPost)"), false);
});

test("general post detail uses the workout modal on compact and the trailing pane when unfolded", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const modal = source("./workout-detail-modal.tsx");
  const detail = source("./general-post-detail.tsx");

  assert.match(community, /openGeneralPostDetail/);
  assert.match(community, /onPress=\{\(\) => openGeneralPostDetail\(post\)\}/);
  assert.match(community, /setExplicitOverride\(post\.id\)/);
  assert.match(community, /router\.setParams\(\{ post: post\.id \}\)/);
  assert.match(community, /generalPost=\{detailTarget \? null : generalDetail\}/);
  assert.match(community, /visible=\{detailTarget !== null \|\| generalDetail !== null\}/);
  assert.equal(community.includes("StyleSheet.absoluteFill"), false);
  assert.match(community, /presentation="community-pane"/);
  assert.match(community, /right=\{generalDetail \?/);

  assert.match(modal, /presentationStyle="overFullScreen"/);
  assert.match(modal, /CenteredCard/);
  assert.match(modal, /<GeneralPostDetailView/);
  assert.match(modal, /presentation="community-modal"/);
  assert.match(modal, /kind="close"/);
  const closeAt = modal.indexOf('kind="close"');
  const titleAt = modal.indexOf(">Post<");
  assert.ok(closeAt > 0 && titleAt > closeAt);

  assert.match(detail, /presentation\?: "community-modal" \| "community-pane"/);
  assert.equal(detail.includes('kind="back"'), false);
  assert.equal(detail.includes("insets.top"), false);
  assert.equal(detail.includes("RoundIconButton"), false);
  assert.equal(detail.includes("groupHeaderRow"), false);
  assert.equal(detail.includes("CommunityGroupControls"), false);
});

test("Comments label is shared, sentence case, ExtraBold 13, brandPressed, with 16/20 spacing", () => {
  const label = source("./comments-section-label.tsx");
  const workout = source("./workout-detail.tsx");
  const general = source("./general-post-detail.tsx");

  assert.equal(colors.brandPressed, "#9E3500");
  assert.equal(type.label.fontSize, 13);
  assert.equal(fonts.extrabold, "Nunito_800ExtraBold");
  assert.equal(spacing.lg, 16);
  assert.equal(spacing.xl, 20);

  assert.match(label, /commentsSectionLabelCopy = "Comments"/);
  assert.equal(label.includes("COMMENTS"), false);
  assert.match(label, /color: colors.brandPressed/);
  assert.match(label, /fontFamily: fonts.extrabold/);
  assert.match(label, /fontSize: type.label.fontSize/);
  assert.match(label, /letterSpacing: 0/);
  assert.match(label, /afterPost: spacing.lg/);
  assert.match(label, /beforeList: spacing.xl/);

  assert.match(workout, /CommentsSectionLabel/);
  assert.match(workout, /commentsSectionSpacing.afterPost/);
  assert.match(workout, /commentsSectionSpacing.beforeList/);
  assert.equal(workout.includes("commentsHeading"), false);
  assert.equal(workout.includes('isCommunitySheet ? "Comments"'), false);

  assert.match(general, /CommentsSectionLabel/);
  assert.match(general, /commentsSectionSpacing.afterPost/);
  assert.match(general, /commentsSectionSpacing.beforeList/);
});

test("crew switcher cannot paint over general post detail because the overlay path is gone", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const modal = source("./workout-detail-modal.tsx");
  const detail = source("./general-post-detail.tsx");

  assert.match(community, /groupHeaderRow: \{[^}]*zIndex: 20/);
  assert.match(community, /selectorAnchor: \{[^}]*zIndex: 21/);
  assert.equal(community.includes("StyleSheet.absoluteFill"), false);
  assert.equal(community.includes("<GeneralPostDetailView"), true);
  const overlayBlock = community.includes("mode !== \"twoPane\" && generalDetail");
  assert.equal(overlayBlock, false);

  assert.match(modal, /<Modal/);
  assert.match(modal, /groupId && generalPost/);
  assert.match(detail, /presentation === "community-modal"/);
  assert.equal(detail.includes("zIndex"), false);
});

test("crew_post deep links still land on the community post param", () => {
  const push = source("../../../packages/validation/src/push.ts");
  const community = source("../app/(tabs)/community/index.tsx");
  const host = source("./push-notifications-host.tsx");
  assert.match(push, /params.set\("post", payload.postId/);
  assert.match(push, /\/\(tabs\)\/community\?/);
  assert.match(community, /readCommunityPostParam\(params.post\)/);
  assert.match(community, /readCommunityPostParam\(params.groupId\)/);
  assert.match(community, /if \(item\) setGeneralDetail\(item\)/);
  assert.match(host, /crewPushHref\(payload\)/);
});
