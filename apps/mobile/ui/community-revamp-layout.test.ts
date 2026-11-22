import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ENTRY_ROW_DIVIDER_INSET,
  ENTRY_ROW_HALF_INSET,
  ENTRY_ROW_HEIGHT,
  ENTRY_ROW_PAIR_GAP,
  REACTION_EMOJI_SIZE,
  REACTION_HIT,
  REACTION_PILL_HEIGHT,
  REACTION_PILL_ONE_DIGIT_WIDTH,
  REACTION_PILL_ZERO_WIDTH,
  activityEntryLabel,
  communityRevampCopy,
  formatEntryCount,
  highlightsEntryLabel,
} from "@repin/validation";

import {
  communityContextOpensPushed,
  communityContextRoute,
  communityHeaderIsCompact,
  communityLayoutRecipe,
  communityWhoReactedInContentPane,
  isCommunityContextPane,
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
  assert.match(community, /CommunityBoardHeader/);
  assert.match(revamp, /CrewHeaderStrip/);
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
  assert.equal(stack.includes('name="progress"'), false);
  assert.match(stack, /name="highlights"/);
  assert.match(stack, /name="activity"/);
  assert.equal("progress" in communityRevampCopy, false);
  assert.equal(REACTION_PILL_ZERO_WIDTH, 36);
  assert.equal(REACTION_PILL_ONE_DIGIT_WIDTH, 50.4);
});

test("Progress is gone from Community UI; /community/progress and pane=progress fall back to the board", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const revamp = source("./community-revamp.tsx");
  const stack = source("./tab-root-stack.tsx");
  const layout = source("../lib/community-revamp-layout.ts");
  const api = source("../lib/community-revamp-api.ts");
  const context = source("./community-context-screen.tsx");

  assert.equal(isCommunityContextPane("progress"), false);
  assert.equal(isCommunityContextPane("highlights"), true);
  assert.equal(isCommunityContextPane("activity"), true);
  assert.equal(communityContextRoute("highlights"), "/community/highlights");
  assert.equal(communityContextRoute("activity"), "/community/activity");

  assert.match(community, /const paneParam = isCommunityContextPane\(paneRaw\) \? paneRaw : null/);
  assert.equal(community.includes("openContextPane(\"progress\")"), false);
  assert.equal(community.includes("/community/progress"), false);
  assert.equal(stack.includes("progress"), false);
  assert.equal(revamp.includes("CrewProgress"), false);
  assert.equal(revamp.includes("ProgressSkeleton"), false);
  assert.equal(revamp.includes("weekPulse"), false);
  assert.equal(api.includes("fetchCrewProgress"), false);
  assert.equal(context.includes("progress"), false);
  assert.equal(layout.includes('"progress"'), false);
});

test("entry row D is one 44 pt two-zone Card, always showing Highlights and Activity including 0", () => {
  const revamp = source("./community-revamp.tsx");
  assert.equal(ENTRY_ROW_HEIGHT, size.hit);
  assert.equal(ENTRY_ROW_PAIR_GAP, 6);
  assert.equal(ENTRY_ROW_HALF_INSET, spacing.sm);
  assert.equal(ENTRY_ROW_DIVIDER_INSET, 10);
  assert.equal(communityRevampCopy.highlights, "Highlights");
  assert.equal(communityRevampCopy.activity, "Activity");
  assert.equal(highlightsEntryLabel(0), "Highlights, 0");
  assert.equal(activityEntryLabel(0), "Activity on your posts, 0");
  assert.equal(formatEntryCount(0), "0");

  assert.match(revamp, /export function CrewEntryRows/);
  assert.match(revamp, /<Card style=\{styles.entryCard\}>/);
  assert.match(revamp, /height: communityEntryRowHeight/);
  assert.match(revamp, /padding: 0/);
  assert.match(revamp, /ENTRY_ROW_HALF_INSET/);
  assert.match(revamp, /ENTRY_ROW_DIVIDER_INSET/);
  assert.match(revamp, /fonts\.display/);
  assert.match(revamp, /fonts\.semibold/);
  assert.match(revamp, /colors\.brandTint/);
  assert.match(revamp, /colors\.brandPressed/);
  const entrySource = revamp.slice(
    revamp.indexOf("export function CrewEntryRows"),
    revamp.indexOf("export function CommunityBoardHeader"),
  );
  assert.equal(entrySource.includes("SegmentedControl"), false);
  assert.equal(revamp.includes("weekPulse"), false);
  assert.match(revamp, /highlightsEntryLabel/);
  assert.match(revamp, /activityEntryLabel/);
  assert.match(source("../app/(tabs)/community/index.tsx"), /board\?\.crew\?\.activityCount/);
  assert.match(source("../app/(tabs)/community/index.tsx"), /board\?\.crew\?\.highlightCount/);
});

test("CommunityBoardHeader lives inside the compact feed ScrollView and two-pane left column", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const revamp = source("./community-revamp.tsx");
  assert.match(revamp, /export function CommunityBoardHeader/);
  assert.match(community, /<CommunityBoardHeader/);
  assert.equal((community.match(/<CommunityBoardHeader/g) ?? []).length, 2);
  assert.match(
    community,
    /<ScrollView[\s\S]*<ScrollAnchor id="community-header">[\s\S]*<CommunityBoardHeader/,
  );
  assert.equal(community.includes("boardHeight"), false);
  assert.equal(community.includes("handleBoardLayout"), false);
  assert.match(community, /communityFeedNearEnd/);
  assert.match(community, /readStoredScrollAnchor\(communityFeedAnchorKey\)/);
  assert.match(community, /compactScroll\.onScroll/);
  assert.match(community, /style=\{styles\.flex\}/);
});

test("locked chrome stays on Community nested screens and the orange plus is not rebuilt", () => {
  const community = source("../app/(tabs)/community/index.tsx");
  const stack = source("./tab-root-stack.tsx");
  const context = source("./community-context-screen.tsx");
  assert.match(community, /tabScreenTopStyle/);
  assert.match(community, /CommunityBoardHeader/);
  assert.match(source("./community-revamp.tsx"), /CommunityNewPostButton/);
  assert.match(source("./community-revamp.tsx"), /generalPostCopy\.newPost/);
  assert.match(stack, /toggleWorkoutChooser/);
  assert.match(context, /tabScreenTopStyle/);
  assert.match(context, /RoundIconButton/);
  assert.equal(community.includes("LogWorkoutChooser"), false);
  assert.equal(community.includes("getVerticalBarEdge"), false);
});
