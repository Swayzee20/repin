import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  communityFeedCardLayout,
  generalPostFeedCardLabel,
  isOwnPost,
  ownPostAndSelectedMarkers,
  ownPostAuthorNameRowStyle,
  ownPostAuthorNameStyle,
  ownPostYouTagBorderWidth,
  ownPostYouTagGap,
  ownPostYouTagHeight,
  ownPostYouTagLabel,
  ownPostYouTagPadding,
  ownPostYouTagRadius,
  ownPostYouTagStyle,
  ownPostYouTagTextStyle,
  selectedCardInsetWidth,
  workoutFeedCardLabel,
} from "./community-feed-layout";
import { colors, fonts, type } from "./theme";

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

function assertOwnPostYouTagOnCard(card: string) {
  assert.match(card, /OwnPostYouTag/);
  assert.match(card, /isOwn \? <OwnPostYouTag \/> : null/);
  assert.match(card, /authorNameRow/);
  assert.match(card, /ownPostAuthorNameRowStyle/);
  assert.match(card, /numberOfLines=\{1\}/);
  assert.equal(card.includes("ownPostMarkerStyle"), false);
  assert.equal(card.includes("ownPostEdge"), false);
  assert.equal(card.includes("ownEdge"), false);
  assert.equal(card.includes("ownPostVoiceOverLabel"), false);
  assert.equal(card.includes("Your post"), false);
  assert.equal(card.includes("accessibilityLabel={isOwn"), false);
}

test("community feed cards fill the column with no stagger or motion", () => {
  const layout = communityFeedCardLayout();
  assert.equal(layout.width, "100%");
  assert.equal(layout.alignSelf, "stretch");
  assert.equal("transform" in layout, false);

  const components = source("components.tsx");
  assert.match(components, /width: "100%"/);
  assert.equal(components.includes("floatingLeft"), false);
  assert.equal(components.includes("floatingRight"), false);
  assert.equal(components.includes("feedCardShell"), false);
  assert.equal(components.includes('width: "94%"'), false);
  assert.equal(components.includes("side={index % 2"), false);
  assert.equal(components.includes("side?:"), false);
  assert.equal(components.includes("useReducedMotion"), false);
  assert.equal(components.includes("useAnimatedStyle"), false);
  assert.equal(components.includes("interpolate("), false);
  assert.equal(components.includes("rotateY"), false);
  assert.equal(components.includes("rotateZ"), false);
  assert.equal(components.includes("translateX"), false);
  assert.equal(components.includes("export function WorkoutCard"), false);
  assert.equal(components.includes("focusOffsetY"), false);
});

test("own posts get a centered You tag with tonalEdge hairline, not a left edge", () => {
  assert.equal(ownPostYouTagLabel, "You");
  assert.equal(ownPostYouTagHeight, 18);
  assert.equal(ownPostYouTagPadding, 6);
  assert.equal(ownPostYouTagGap, 6);
  assert.equal(ownPostYouTagRadius, 9);
  assert.equal(ownPostYouTagBorderWidth, 1);
  assert.equal(colors.tonalEdge, "#F6D9C6");
  assert.equal(colors.brandTint, "#FFF1E6");
  assert.equal(colors.brandPressed, "#9E3500");
  assert.notEqual(colors.tonalEdge, colors.boardBorder);

  const marker = ownPostYouTagStyle();
  assert.equal(marker.backgroundColor, colors.brandTint);
  assert.equal(marker.borderColor, colors.tonalEdge);
  assert.equal(marker.borderColor, "#F6D9C6");
  assert.equal(marker.borderWidth, 1);
  assert.equal(marker.borderRadius, 9);
  assert.equal(marker.height, 18);
  assert.equal(marker.paddingHorizontal, 6);
  assert.equal(marker.marginLeft, 6);
  assert.equal(marker.alignItems, "center");
  assert.equal(marker.alignSelf, "center");
  assert.equal(marker.justifyContent, "center");
  assert.equal(marker.flexShrink, 0);

  const text = ownPostYouTagTextStyle();
  assert.equal(text.color, colors.brandPressed);
  assert.equal(text.color, "#9E3500");
  assert.equal(text.fontFamily, fonts.bold);
  assert.equal(text.fontSize, type.micro.fontSize);
  assert.equal(text.lineHeight, type.micro.lineHeight);
  assert.equal(type.micro.fontSize, 11);
  assert.equal(type.micro.lineHeight, 14);

  const nameRow = ownPostAuthorNameRowStyle();
  assert.equal(nameRow.alignItems, "center");
  assert.equal(nameRow.flexDirection, "row");
  assert.equal(nameRow.minWidth, 0);
  assert.equal(ownPostAuthorNameStyle().flexShrink, 1);
  assert.equal(ownPostAuthorNameStyle().minWidth, 0);

  const tag = source("own-post-you-tag.tsx");
  assert.match(tag, /ownPostYouTagLabel/);
  assert.equal(tag.includes("Your post"), false);
  assert.equal(tag.includes("accessibilityLabel"), false);
  assert.equal(tag.includes("boardBorder"), false);

  assertOwnPostYouTagOnCard(source("components.tsx"));
  assertOwnPostYouTagOnCard(source("general-post-card.tsx"));
  assertOwnPostYouTagOnCard(source("workout-detail.tsx"));
});

test("own-post VoiceOver uses the visible You text and selected stays a 2 pt ring", () => {
  assert.equal(isOwnPost("user-1", "user-1"), true);
  assert.equal(isOwnPost("user-1", "user-2"), false);
  assert.equal(isOwnPost("user-1", null), false);
  assert.equal(isOwnPost("user-1", undefined), false);

  assert.equal(
    workoutFeedCardLabel({ title: "Push day" }),
    "Open Push day workout details",
  );
  assert.equal(
    workoutFeedCardLabel({ title: "Cindy" }),
    "Open Cindy workout details",
  );
  assert.equal(workoutFeedCardLabel({ title: "Push day" }).includes("Your post"), false);
  assert.equal(workoutFeedCardLabel({ title: "Push day" }).includes("You"), false);
  assert.equal(generalPostFeedCardLabel(), "Open post details");
  assert.equal(generalPostFeedCardLabel().includes("Your post"), false);
  assert.equal(generalPostFeedCardLabel().includes("You"), false);

  const markers = ownPostAndSelectedMarkers();
  assert.equal(markers.own.placement, "author-name-tag");
  assert.equal(markers.own.label, "You");
  assert.equal(markers.own.border, colors.tonalEdge);
  assert.equal(markers.own.border, "#F6D9C6");
  assert.equal(markers.own.fill, colors.brandTint);
  assert.equal(markers.own.color, colors.brandPressed);
  assert.equal(markers.selected.placement, "inset-ring");
  assert.equal(markers.selected.width, selectedCardInsetWidth);
  assert.equal(selectedCardInsetWidth, 2);
  assert.notEqual(markers.own.placement, markers.selected.placement);

  const components = source("components.tsx");
  assert.match(components, /workoutFeedCardLabel/);
  assert.match(components, /inset 0 0 0 2px \$\{colors\.brand\}/);
  assert.equal(components.includes("ownPostVoiceOverLabel"), false);
  assert.equal(components.includes("Your post"), false);

  const community = source("../app/(tabs)/community/index.tsx");
  assert.match(community, /isOwnPost/);
  assert.match(community, /workoutFeedCardLabel/);
  assert.match(community, /isOwn=\{isOwn\}/);
  assert.match(community, /selected=\{selected\}/);
  assert.match(community, /generalPostCopy\.newPost/);
  assert.equal(community.includes("CommunityDatePicker"), false);
  assert.equal(community.includes("Your post"), false);
  assert.equal(community.includes("ownPostVoiceOverLabel"), false);
});
