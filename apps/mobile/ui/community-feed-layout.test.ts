import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  communityFeedCardLayout,
  isOwnPost,
  ownPostAndSelectedMarkers,
  ownPostEdgeWidth,
  ownPostMarkerStyle,
  ownPostVoiceOverLabel,
  selectedCardInsetWidth,
  workoutFeedCardLabel,
} from "./community-feed-layout";
import { colors, radii } from "./theme";

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
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
  assert.equal(components.includes('side={index % 2'), false);
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

test("own posts get a 3 pt brand left edge clipped to radii.lg", () => {
  assert.equal(ownPostEdgeWidth, 3);
  assert.equal(colors.brand, "#C94300");
  const marker = ownPostMarkerStyle();
  assert.equal(marker.backgroundColor, colors.brand);
  assert.equal(marker.backgroundColor, "#C94300");
  assert.equal(marker.width, 3);
  assert.equal(marker.borderTopLeftRadius, radii.lg);
  assert.equal(marker.borderBottomLeftRadius, radii.lg);
  assert.equal(radii.lg, 14);

  const components = source("components.tsx");
  assert.match(components, /ownPostMarkerStyle/);
  assert.match(components, /isOwn/);
  assert.equal(components.includes('"You"'), false);
  assert.equal(components.includes("brandTint"), false);
});

test("own-post VoiceOver text includes Your post and selected stays a 2 pt ring", () => {
  assert.equal(ownPostVoiceOverLabel, "Your post");
  assert.equal(isOwnPost("user-1", "user-1"), true);
  assert.equal(isOwnPost("user-1", "user-2"), false);
  assert.equal(isOwnPost("user-1", null), false);
  assert.equal(isOwnPost("user-1", undefined), false);

  assert.equal(
    workoutFeedCardLabel({ isOwn: true, title: "Push day" }),
    "Your post. Open Push day workout details",
  );
  assert.equal(
    workoutFeedCardLabel({ isOwn: false, title: "Push day" }),
    "Open Push day workout details",
  );
  assert.match(workoutFeedCardLabel({ isOwn: true, title: "Cindy" }), /Your post/);

  const markers = ownPostAndSelectedMarkers();
  assert.equal(markers.own.placement, "left-edge");
  assert.equal(markers.own.width, 3);
  assert.equal(markers.selected.placement, "inset-ring");
  assert.equal(markers.selected.width, selectedCardInsetWidth);
  assert.equal(selectedCardInsetWidth, 2);
  assert.notEqual(markers.own.placement, markers.selected.placement);
  assert.notEqual(markers.own.width, markers.selected.width);

  const components = source("components.tsx");
  assert.match(components, /ownPostVoiceOverLabel/);
  assert.match(components, /workoutFeedCardLabel/);
  assert.match(components, /inset 0 0 0 2px \$\{colors\.brand\}/);

  const community = source("../app/(tabs)/community/index.tsx");
  assert.match(community, /isOwnPost/);
  assert.match(community, /workoutFeedCardLabel/);
  assert.match(community, /isOwn=\{isOwn\}/);
  assert.match(community, /selected=\{selected\}/);
});
