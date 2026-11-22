import type {
  CommunityActivityItem,
  CommunityHighlights,
  CommunityReactionSummary,
  CommunityReactionType,
  CommunityWhoReacted,
} from "@repin/types";
import { communityReactionTypes, personFirstName } from "@repin/types";
import { z } from "zod";

import { addZonedDays, isValidTimeZone, startOfZonedDay, sundayWeekBounds, sundayWeekBoundsFromOffset, zonedParts } from "./calendar";
import { formatRelativeShort, HOME_HIGHLIGHT_LIMIT } from "./home";
import { formatDashboardDistance, formatRecordedDuration, homeLocalBounds } from "./profile-dashboard";

export const HIGHLIGHT_WEEKLY_MIN = 2;
export const HIGHLIGHT_CONSISTENT_DAYS = 3;
export const HIGHLIGHT_HOME_WEEKLY_LIMIT = HOME_HIGHLIGHT_LIMIT;
export const HIGHLIGHT_BADGE_LIMIT = 5;
export const CREW_ACTIVITY_DAYS = 14;
export const CREW_ACTIVITY_LIMIT = 30;
export const LATEST_COMMENT_PREVIEW_MAX = 140;
export const REACTION_PILL_HEIGHT = 32;
export const REACTION_EMOJI_SIZE = 16;
export const REACTION_PILL_PAD_X = 10;
export const REACTION_PILL_INNER_GAP = 6;
export const REACTION_PILLS_GAP = 8;
export const REACTION_PILL_ZERO_WIDTH = 36;
export const REACTION_PILL_ONE_DIGIT_WIDTH = 50.4;
export const REACTION_PILL_TWO_DIGIT_WIDTH = 58.8;
export const REACTION_HIT = 44;
export const REACTION_VERTICAL_HITSLOP = 6;

export const communityReactionOptions: Record<
  CommunityReactionType,
  { emoji: string; label: string }
> = {
  fire: { emoji: "🔥", label: "Fire" },
  strong: { emoji: "💪", label: "Strong" },
  clap: { emoji: "👏", label: "Clap" },
};

export const communityRevampCopy = {
  title: "Community",
  progress: "Progress",
  highlights: "Highlights",
  activity: "Activity on your posts",
  activityTitle: "Activity",
  thisWeek: "This week",
  lastWeek: "Last week",
  last14Days: "Last 14 days",
  seeAll: "See all",
  switchCrew: "Switch crew",
  viewCrew: "View crew",
  board: "Community Board",
  new: "New",
  earlier: "Earlier",
  reactions: "Reactions",
  emptyPulse: "No one's repped in yet this week",
  emptyHighlights: "No highlights this week",
  emptyActivity: "No activity on your posts in the last 14 days.",
  loadCommunity: "Couldn't load Community",
  loadProgress: "Couldn't load Progress",
  loadHighlights: "Couldn't load Highlights",
  loadActivity: "Couldn't load activity",
  loadPost: "Couldn't load this post.",
  errorBody: "Check your connection and try again.",
  tryAgain: "Try again",
  firstToRepInToday: "First to rep in today",
  consistent: "Consistent",
  sharedPr: "Shared a PR",
  sharedGoal: "Shared a goal reached",
  mostCheered: "Most-cheered post",
  owner: "Owner",
} as const;

export const crewWeekQuerySchemaValues = ["current", "previous"] as const;
export type CrewWeekQuery = (typeof crewWeekQuerySchemaValues)[number];

const timeZoneQuery = z.object({
  timeZone: z.string().trim().min(1).max(64).optional().superRefine((value, context) => {
    if (value && !isValidTimeZone(value)) {
      context.addIssue({ code: "custom", message: "Choose a valid time zone" });
    }
  }),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
}).superRefine((value, context) => {
  if (!value.timeZone && value.timezoneOffsetMinutes == null) {
    context.addIssue({
      code: "custom",
      message: "Choose a valid time zone",
      path: ["timeZone"],
    });
  }
});

export const crewWeekQuerySchema = timeZoneQuery.and(z.object({
  week: z.enum(crewWeekQuerySchemaValues).optional().default("current"),
}));

export const crewActivityQuerySchema = timeZoneQuery.and(z.object({
  before: z.iso.datetime().optional(),
}));

export function crewWeekWindow(
  now: Date,
  timeZone: string,
  week: CrewWeekQuery = "current",
) {
  const current = sundayWeekBounds(now, timeZone);
  if (week === "current") {
    return {
      todayStart: startOfZonedDay(now, timeZone),
      weekStart: current.weekStart,
      weekEnd: current.weekEnd,
      rangeEnd: now,
    };
  }
  const previousStart = addZonedDays(current.weekStart, -7, timeZone);
  const previous = sundayWeekBounds(previousStart, timeZone);
  return {
    todayStart: null as Date | null,
    weekStart: previous.weekStart,
    weekEnd: previous.weekEnd,
    rangeEnd: previous.weekEnd,
  };
}

export function resolveCrewWeekWindow(
  now: Date,
  query: { timeZone?: string; timezoneOffsetMinutes?: number },
  week: CrewWeekQuery = "current",
) {
  if (query.timeZone) return crewWeekWindow(now, query.timeZone, week);
  const bounds = homeLocalBounds(now, query);
  if (week === "current") {
    return {
      todayStart: bounds.todayStart,
      weekStart: bounds.weekStart,
      weekEnd: bounds.weekEnd,
      rangeEnd: now,
    };
  }
  const previous = sundayWeekBoundsFromOffset(
    new Date(bounds.weekStart.getTime() - 1),
    query.timezoneOffsetMinutes ?? 0,
  );
  return {
    todayStart: null as Date | null,
    weekStart: previous.weekStart,
    weekEnd: previous.weekEnd,
    rangeEnd: previous.weekEnd,
  };
}

export function highlightCountOf(highlights: CommunityHighlights, crewSize: number) {
  return communityHighlightRows(highlights, { crewSize, week: "current" }).length;
}

export function communityHighlightRows(
  highlights: CommunityHighlights,
  input: { crewSize: number; week: CrewWeekQuery },
) {
  const rows: Array<
    | { kind: "first"; userId: string; displayName: string }
    | { kind: "count"; userId: string; displayName: string; count: number }
    | { kind: "consistent"; userId: string; displayName: string; count: number }
    | { kind: "pr"; userId: string; displayName: string; label: string }
    | { kind: "goal"; userId: string; displayName: string; label: string }
    | { kind: "cheered"; userId: string; displayName: string; title: string; postId: string; sessionId: string | null }
  > = [];
  if (input.week === "current" && highlights.firstToRepInToday) {
    rows.push({ kind: "first", ...highlights.firstToRepInToday });
  }
  for (const weekly of highlights.weekly) {
    if (weekly.count >= HIGHLIGHT_WEEKLY_MIN) rows.push({ kind: "count", ...weekly });
  }
  if (input.crewSize > 1) {
    for (const row of highlights.consistent) {
      if (row.count >= HIGHLIGHT_CONSISTENT_DAYS) rows.push({ kind: "consistent", ...row });
    }
  }
  for (const badge of highlights.sharedPrs) {
    rows.push({ kind: "pr", ...badge });
  }
  for (const badge of highlights.sharedGoals) {
    rows.push({ kind: "goal", ...badge });
  }
  if (input.crewSize > 1 && highlights.mostCheered && highlights.mostCheered.reactionCount > 0) {
    rows.push({
      kind: "cheered",
      userId: highlights.mostCheered.userId,
      displayName: highlights.mostCheered.displayName,
      title: highlights.mostCheered.title,
      postId: highlights.mostCheered.postId,
      sessionId: highlights.mostCheered.sessionId,
    });
  }
  return rows;
}

export function homeHighlightsFromCrew(highlights: CommunityHighlights) {
  return {
    firstToRepInToday: highlights.firstToRepInToday,
    weekly: highlights.weekly
      .filter((row) => row.count >= HIGHLIGHT_WEEKLY_MIN)
      .slice(0, HIGHLIGHT_HOME_WEEKLY_LIMIT),
  };
}

export function progressPulseLine(activeMembers: number, memberCount: number) {
  if (activeMembers <= 0) return communityRevampCopy.emptyPulse;
  return `${activeMembers} of ${memberCount} repped in this week`;
}

export function progressMembersLine(activeMembers: number, memberCount: number) {
  return `${activeMembers} of ${memberCount} members repped in`;
}

export function progressMemberStatsLine(workouts: number, days: number) {
  return `${workouts} workout${workouts === 1 ? "" : "s"} · ${days} day${days === 1 ? "" : "s"}`;
}

export function progressTotalsLine(input: {
  sharedWorkouts: number;
  recordedMeters: number | null;
  recordedSeconds: number | null;
}) {
  const parts = [`${input.sharedWorkouts} workout${input.sharedWorkouts === 1 ? "" : "s"}`];
  if (input.recordedMeters != null && input.recordedMeters > 0) {
    const distance = formatDashboardDistance(input.recordedMeters, "mi");
    if (distance) parts.push(distance);
  }
  if (input.recordedSeconds != null && input.recordedSeconds > 0) {
    const time = formatRecordedDuration(input.recordedSeconds);
    if (time) parts.push(time);
  }
  return parts.join(" · ");
}

export function highlightsRowSubtitle(count: number) {
  return `${communityRevampCopy.thisWeek} · ${count}`;
}

export function highlightCountLine(name: string, count: number) {
  return `repped in ${count} times this week`;
}

export function highlightConsistentLine(days: number) {
  return `${communityRevampCopy.consistent} · ${days} day${days === 1 ? "" : "s"}`;
}

export function highlightCheeredLine(title: string) {
  return `${communityRevampCopy.mostCheered} · ${title}`;
}

export function reactionAccessibilityLabel(
  type: CommunityReactionType,
  count: number,
  selected: boolean,
) {
  const option = communityReactionOptions[type];
  const noun = count === 1 ? "reaction" : "reactions";
  return `${option.label}, ${count} ${noun}${selected ? ", selected" : ""}`;
}

export function reactionPillWidth(count: number) {
  if (count <= 0) return REACTION_PILL_ZERO_WIDTH;
  if (count < 10) return REACTION_PILL_ONE_DIGIT_WIDTH;
  return REACTION_PILL_TWO_DIGIT_WIDTH;
}

export function reactionPillHitSlop(count: number) {
  const horizontal = Math.max(0, Math.ceil((REACTION_HIT - reactionPillWidth(count)) / 2));
  return {
    top: REACTION_VERTICAL_HITSLOP,
    bottom: REACTION_VERTICAL_HITSLOP,
    left: horizontal,
    right: horizontal,
  };
}

export function emptyReactionSummary(): CommunityReactionSummary {
  return {
    counts: { fire: 0, strong: 0, clap: 0 },
    total: 0,
    viewerReaction: null,
  };
}

export function optimisticReactionSummary(
  previous: CommunityReactionSummary,
  nextReaction: CommunityReactionType,
): CommunityReactionSummary {
  const counts = { ...previous.counts };
  const removing = previous.viewerReaction === nextReaction;
  if (previous.viewerReaction) {
    counts[previous.viewerReaction] = Math.max(0, counts[previous.viewerReaction] - 1);
  }
  if (!removing) counts[nextReaction] += 1;
  return {
    counts,
    total: counts.fire + counts.strong + counts.clap,
    viewerReaction: removing ? null : nextReaction,
  };
}

export function truncateCommentPreview(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= LATEST_COMMENT_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, LATEST_COMMENT_PREVIEW_MAX - 1).trimEnd()}…`;
}

export function activityReactionLine(input: {
  name: string;
  reactionType: CommunityReactionType;
  postTitle: string;
  createdAt: string;
  now: Date;
}) {
  const verb = input.reactionType === "clap" ? "clapped" : "cheered";
  const title = input.postTitle.trim() || "post";
  const relative = formatRelativeShort(new Date(input.createdAt), input.now);
  return `${input.name} ${verb} your ${title} · ${relative}`;
}

export function activityCommentLine(input: { name: string; text: string }) {
  return `${input.name} commented: ${input.text.trim()}`;
}

export function activityItemLine(item: CommunityActivityItem, now: Date) {
  const name = personFirstName(item.actorDisplayName);
  if (item.kind === "comment") {
    return activityCommentLine({ name, text: item.commentText ?? "" });
  }
  return activityReactionLine({
    name,
    reactionType: item.reactionType ?? "fire",
    postTitle: item.postTitle,
    createdAt: item.createdAt,
    now,
  });
}

export function groupActivityItems(
  items: readonly CommunityActivityItem[],
  now: Date,
  timeZone = "UTC",
) {
  const dayStart = startOfZonedDay(now, timeZone);
  const fresh: CommunityActivityItem[] = [];
  const earlier: CommunityActivityItem[] = [];
  for (const item of items) {
    if (new Date(item.createdAt).getTime() >= dayStart.getTime()) fresh.push(item);
    else earlier.push(item);
  }
  return { fresh, earlier };
}

export function groupWhoReacted(
  data: CommunityWhoReacted,
  focus?: CommunityReactionType,
) {
  const groups = communityReactionTypes
    .map((reactionType) => {
      const group = data.groups.find((item) => item.reactionType === reactionType);
      return {
        reactionType,
        ...communityReactionOptions[reactionType],
        reactors: group?.reactors ?? [],
      };
    })
    .filter((group) => group.reactors.length > 0);
  if (!focus) return groups;
  return [
    ...groups.filter((group) => group.reactionType === focus),
    ...groups.filter((group) => group.reactionType !== focus),
  ];
}

export function weekdayLetters() {
  return ["S", "M", "T", "W", "T", "F", "S"] as const;
}

export function localWeekdayIndex(instant: Date, timeZone: string) {
  return zonedParts(instant, timeZone).weekday;
}

export function staleBannerTime(now = new Date()) {
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function staleBannerCopy(time: string) {
  return `Couldn't refresh. Last updated ${time}.`;
}
