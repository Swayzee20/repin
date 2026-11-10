import type { GoalBadge, PrBadge } from "@repin/types";
import { goalChipAccessibility } from "@repin/validation";

import { prCopy } from "./pr-copy";

export function prBadgeAccessibilityLabel(count: number) {
  return count === 1 ? prCopy.personalRecordChip : `${count} personal records`;
}

export function mixedBadgeAccessibilityLabel(goalCount: number, prCount: number) {
  if (goalCount > 0 && prCount > 0) return goalChipAccessibility.mixed(goalCount, prCount);
  if (goalCount > 0) return goalChipAccessibility.goal(goalCount);
  return prBadgeAccessibilityLabel(prCount);
}

export function visiblePrBadgeChips<T>(badges: T[]) {
  const extra = Math.max(0, badges.length - 2);
  return {
    accessibilityLabel: prBadgeAccessibilityLabel(badges.length),
    chips: badges.slice(0, 2),
    overflow: extra,
  };
}

export type AchievementChip =
  | { id: string; type: "goal" }
  | { id: string; type: "pr" };

export function visibleMixedBadgeChips(goalBadges: GoalBadge[] | undefined, prBadges: PrBadge[] | undefined) {
  const goals = goalBadges ?? [];
  const prs = prBadges ?? [];
  const chips: AchievementChip[] = [];
  const firstGoal = goals[0];
  const firstPr = prs[0];
  if (firstGoal && firstPr) {
    chips.push({ id: firstGoal.id, type: "goal" });
    chips.push({ id: firstPr.id, type: "pr" });
  } else if (goals.length) {
    for (const badge of goals.slice(0, 2)) chips.push({ id: badge.id, type: "goal" });
  } else {
    for (const badge of prs.slice(0, 2)) chips.push({ id: badge.id, type: "pr" });
  }
  const overflow = Math.max(0, goals.length + prs.length - chips.length);
  return {
    accessibilityLabel: mixedBadgeAccessibilityLabel(goals.length, prs.length),
    chips,
    overflow,
  };
}
