import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  REACTION_EMOJI_SIZE,
  REACTION_HIT,
  REACTION_PILL_HEIGHT,
  REACTION_PILL_ONE_DIGIT_WIDTH,
  REACTION_PILL_ZERO_WIDTH,
  communityRevampCopy,
} from "@repin/validation";

import {
  communityContextOpensPushed,
  communityHeaderIsCompact,
  communityLayoutRecipe,
  communityWhoReactedInContentPane,
} from "../lib/community-revamp-layout";
import { colors, fonts, radii, size, spacing, type } from "./theme";

/* eslint-disable @typescript-eslint/no-floating-promises */

function source(name: string) {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("Community recipes cover phone, folded Duo, unfolded two-pane, and Split View", () => {
  assert.deepEqual(communityLayoutRecipe("compact"), {
    header: "one-line",
    context: "push",
    splitView: false,
  });
  assert.deepEqual(communityLayoutRecipe("wide"), {
    header: "one-line",
    context: "push",
    splitView: true,
  });
  assert.deepEqual(communityLayoutRecipe("twoPane"), {
    header: "two-line",
    context: "right-pane",
    splitView: false,
  });
  assert.equal(communityHeaderIsCompact("compact"), true);
  assert.equal(communityHeaderIsCompact("wide"), true);
  assert.equal(communityHeaderIsCompact("twoPane"), false);
  assert.equal(communityContextOpensPushed("compact"), true);
  assert.equal(communityContextOpensPushed("wide"), true);
  assert.equal(communityContextOpensPushed("twoPane"), false);
  assert.equal(communityWhoReactedInContentPane("twoPane"), true);
  assert.equal(communityWhoReactedInContentPane("wide"), false);
});

test("Community board uses the approved header, entry rows, reaction pills, and See all", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const revamp = source("./community-revamp.tsx");
  const bar = source("./card-reaction-bar.tsx");
  const home = source("./home.tsx");
  const homeScreen = source("../app/(tabs)/(home)/index.tsx");
  const stack = source("./tab-root-stack.tsx");

  assert.match(community, /CommunityScreenTitle/);
  assert.match(community, /CrewHeaderStrip/);
  assert.match(community, /CrewEntryRows/);
  assert.match(community, /CrewSwitcherSheet/);
  assert.match(community, /WhoReactedSheet/);
  assert.match(community, /CardReactionBar|onToggleReaction/);
  assert.match(community, /CommentPreviewLine|latestComment/);
  assert.match(community, /communityContextRoute/);
  assert.match(community, /paneParam/);
  assert.equal(community.includes("<BrandHeader"), false);
  assert.match(revamp, /onOpenCrew/);
  assert.match(revamp, /onOpenSwitcher/);
  assert.match(revamp, /communityRevampCopy\.viewCrew/);
  assert.match(revamp, /communityRevampCopy\.activity/);
  assert.match(bar, /spacing\.xxxl/);
  assert.match(bar, /size\.icon\.sm/);
  assert.match(bar, /fonts\.bold/);
  assert.match(bar, /radii\.pill/);
  assert.match(bar, /colors\.brandTint/);
  assert.match(bar, /colors\.brandPressed/);
  assert.equal(bar.includes("colors.brand,"), false);
  assert.equal(REACTION_PILL_HEIGHT, spacing.xxxl);
  assert.equal(REACTION_EMOJI_SIZE, size.icon.sm);
  assert.equal(REACTION_HIT, size.hit);
  assert.equal(type.bodySmall.fontSize, 14);
  assert.equal(fonts.bold, "Nunito_700Bold");
  assert.equal(radii.pill, 999);
  assert.equal(colors.brandTint, "#FFF1E6");
  assert.match(home, /communityRevampCopy\.seeAll/);
  assert.match(homeScreen, /onSeeAll/);
  assert.match(homeScreen, /\/community\/highlights/);
  assert.match(stack, /name="progress"/);
  assert.match(stack, /name="highlights"/);
  assert.match(stack, /name="activity"/);
  assert.equal(communityRevampCopy.progress, "Progress");
  assert.equal(REACTION_PILL_ZERO_WIDTH, 36);
  assert.equal(REACTION_PILL_ONE_DIGIT_WIDTH, 50.4);
});

test("locked chrome stays on Community nested screens and the orange plus is not rebuilt", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const stack = source("./tab-root-stack.tsx");
  const context = source("./community-context-screen.tsx");
  assert.match(community, /tabScreenTopStyle/);
  assert.match(community, /CommunityNewPostButton/);
  assert.match(community, /generalPostCopy\.newPost/);
  assert.match(stack, /toggleWorkoutChooser/);
  assert.match(context, /tabScreenTopStyle/);
  assert.match(context, /RoundIconButton/);
  assert.equal(community.includes("LogWorkoutChooser"), false);
  assert.equal(community.includes("getVerticalBarEdge"), false);
});
