import {
  getUserInitials,
  personFirstName,
  resolveUserDisplayName,
  type WorkoutFeedItem,
} from "@repin/types";
import {
  communityRevampCopy,
  crewPromptLine,
  foldedDeadlineLine,
  homeCopy,
  type HomeComingUp,
  type HomeGoalRowModel,
} from "@repin/validation";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ContentMenuItem } from "../lib/content-menu";
import { Button, Card, ContentOptionsMenu, StateCard } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { buildWeeklyConsistencyDays } from "./home-layout";
import { Icon } from "./icons";
import { GoalProgressRing } from "./progress-ring";
import { ListRow } from "./primitives";
import { StaleBanner } from "./profile-dashboard";
import { SectionLabel } from "./section-label";
import type { LastKnownLayout } from "../lib/last-known-layout";
import { colors, fonts, progressRing, radii, size, spacing, type } from "./theme";

export { StaleBanner };

export const homeGoalTitleLineHeight = type.body.lineHeight;
export const homeGoalNudgeLineHeight = type.label.lineHeight;
export const homeStreakTitleLineHeight = type.heading.lineHeight;
export const homeStreakDotMarker = 34;
export const homeStreakDotCircle = 26;
export const homeSnapshotCardPadding = spacing.lg;
export const homeViewGoalsHeight = size.hit;

export function homeSnapshotSkeletonHeight() {
  return homeSnapshotCardPadding * 2
    + progressRing.rowHeight
    + spacing.md
    + homeStreakTitleLineHeight
    + spacing.sm
    + type.micro.lineHeight
    + spacing.xs
    + homeStreakDotMarker
    + spacing.md
    + homeViewGoalsHeight;
}

export function HomeGreeting({ name, placeholder = false }: { name: string; placeholder?: boolean }) {
  if (placeholder) {
    return <View style={styles.skelGreeting} />;
  }
  return <Text numberOfLines={1} style={styles.greeting}>{homeCopy.greeting(name)}</Text>;
}

export function HomeGoalRow({
  onPress,
  row,
}: {
  onPress: () => void;
  row: HomeGoalRowModel;
}) {
  return (
    <Pressable
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [styles.goalRow, webFocusRing(pressableFocused(state))]}
    >
      <GoalProgressRing label={row.centerLabel} progress={row.ratio} reached={row.reached} />
      <View style={styles.goalCopy}>
        <Text numberOfLines={1} style={styles.goalTitle}>{row.title}</Text>
        {row.nudge ? <Text numberOfLines={2} style={styles.goalNudge}>{row.nudge}</Text> : null}
      </View>
    </Pressable>
  );
}

export function HomeSetGoalButton({ onPress }: { onPress: () => void }) {
  return (
    <Button onPress={onPress} style={styles.setGoalButton} variant="tonal">{homeCopy.setWeeklyGoal}</Button>
  );
}

export function HomeStreakDots({
  occurredAt,
  weeks,
}: {
  occurredAt: string[];
  weeks: number;
}) {
  const days = buildWeeklyConsistencyDays(occurredAt);
  return (
    <View>
      <Text style={styles.streakTitle}>{homeStreakLabelSafe(weeks)}</Text>
      <View accessibilityRole="list" style={styles.dots}>
        {days.map((day) => (
          <View
            accessibilityLabel={day.accessibilityLabel}
            accessible
            key={day.key}
            style={styles.dotDay}
          >
            <Text style={[styles.dotWeekday, day.isToday && styles.dotWeekdayToday]}>{day.weekday.slice(0, 1)}</Text>
            <View style={styles.dotMarker}>
              <View style={[
                styles.dotCircle,
                day.completed ? styles.dotCompleted : styles.dotEmpty,
              ]}>
                {day.completed ? <Icon color={colors.surface} name="checkmark" size={size.icon.sm} /> : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeSnapshotCard({
  comingUp,
  goals,
  occurredAt,
  onOpenGoal,
  onSetGoal,
  weekCount,
  weeks,
}: {
  comingUp: HomeComingUp;
  goals: HomeGoalRowModel[];
  occurredAt: string[];
  onOpenGoal: (id: string) => void;
  onSetGoal: () => void;
  weekCount: number;
  weeks: number;
}) {
  const footer = foldedDeadlineLine(comingUp);
  const deadline = comingUp.deadline;
  return (
    <Card>
      {goals.length ? goals.map((row, index) => (
        <View key={row.id} style={index > 0 ? styles.goalDivider : undefined}>
          <HomeGoalRow onPress={() => onOpenGoal(row.id)} row={row} />
        </View>
      )) : (
        <View style={styles.noGoal}>
          <Text style={styles.weekCount}>{homeCopy.thisWeekCount(weekCount)}</Text>
          <HomeSetGoalButton onPress={onSetGoal} />
        </View>
      )}
      <View style={goals.length ? styles.streakAfterGoals : styles.streakAfterEmpty}>
        <HomeStreakDots occurredAt={occurredAt} weeks={weeks} />
      </View>
      {footer.left ? (
        <View style={styles.snapshotFooter}>
          {deadline && footer.right ? (
            <Pressable
              accessibilityLabel={`${deadline.title}, ${deadline.weekday}`}
              accessibilityRole="button"
              onPress={() => onOpenGoal(deadline.goalId)}
              style={(state) => [styles.footerHit, webFocusRing(pressableFocused(state))]}
            >
              <View style={styles.footerRow}>
                <Text style={styles.footerLeft}>{footer.left}</Text>
                <Text style={styles.footerRight}>{footer.right}</Text>
              </View>
            </Pressable>
          ) : deadline && !comingUp.weekEndLine ? (
            <Pressable
              accessibilityLabel={`${deadline.title}, ${deadline.weekday}`}
              accessibilityRole="button"
              onPress={() => onOpenGoal(deadline.goalId)}
              style={(state) => [styles.footerHit, webFocusRing(pressableFocused(state))]}
            >
              <Text style={styles.footerLeft}>{footer.left}</Text>
            </Pressable>
          ) : (
            <Text style={styles.footerLeft}>{footer.left}</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

export function HomeThisWeekCard({
  goals,
  occurredAt,
  onOpenGoal,
  onSetGoal,
  weekCount,
  weeks,
}: {
  goals: HomeGoalRowModel[];
  occurredAt: string[];
  onOpenGoal: (id: string) => void;
  onSetGoal: () => void;
  weekCount: number;
  weeks: number;
}) {
  return (
    <View>
      <SectionLabel style={styles.sectionLabel}>{homeCopy.thisWeek}</SectionLabel>
      <Card>
        {goals.length ? goals.map((row, index) => (
          <View key={row.id} style={index > 0 ? styles.goalDivider : undefined}>
            <HomeGoalRow onPress={() => onOpenGoal(row.id)} row={row} />
          </View>
        )) : (
          <View style={styles.noGoal}>
            <Text style={styles.weekCount}>{homeCopy.thisWeekCount(weekCount)}</Text>
            <HomeSetGoalButton onPress={onSetGoal} />
          </View>
        )}
        <View style={goals.length ? styles.streakAfterGoals : styles.streakAfterEmpty}>
          <HomeStreakDots occurredAt={occurredAt} weeks={weeks} />
        </View>
      </Card>
    </View>
  );
}

export function HomeComingUpCard({
  comingUp,
  onOpenGoal,
}: {
  comingUp: HomeComingUp;
  onOpenGoal: (id: string) => void;
}) {
  if (!comingUp.weekEndLine && !comingUp.deadline) return null;
  const deadline = comingUp.deadline;
  return (
    <View>
      <SectionLabel style={styles.sectionLabel}>{homeCopy.comingUp}</SectionLabel>
      <Card style={styles.comingUpCard}>
        {deadline ? (
          <ListRow
            label={deadline.title}
            onPress={() => onOpenGoal(deadline.goalId)}
            value={deadline.weekday}
          />
        ) : null}
        {comingUp.weekEndLine ? (
          <Text style={[styles.comingUpWeek, comingUp.deadline && styles.comingUpWeekAfter]}>{comingUp.weekEndLine}</Text>
        ) : null}
      </Card>
    </View>
  );
}

export function HomeViewGoals({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={(state) => [styles.viewGoals, webFocusRing(pressableFocused(state))]}
    >
      <Text style={styles.viewGoalsText}>{homeCopy.viewGoals}</Text>
    </Pressable>
  );
}

export function HomeCrewEyebrow({
  name,
  placeholder = false,
}: {
  name?: string | null;
  placeholder?: boolean;
}) {
  return (
    <View style={styles.crewEyebrowRow}>
      <Text style={styles.crewEyebrow}>{homeCopy.yourCrew}</Text>
      {placeholder ? (
        <View style={styles.skelCrewChip} />
      ) : name ? (
        <Text style={styles.crewName}>{`  ·  ${name}`}</Text>
      ) : null}
    </View>
  );
}

export function HomeHighlights({
  onSeeAll,
  rows,
}: {
  onSeeAll?: () => void;
  rows: Array<
    | { kind: "first"; userId: string; displayName: string }
    | { kind: "count"; userId: string; displayName: string; count: number }
  >;
}) {
  if (!rows.length) return null;
  return (
    <View>
      <View style={styles.activityHeader}>
        <SectionLabel>{homeCopy.highlights}</SectionLabel>
        {onSeeAll ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSeeAll}
            style={(state) => [styles.viewAllHit, webFocusRing(pressableFocused(state))]}
          >
            <Text style={styles.viewAll}>{communityRevampCopy.seeAll}</Text>
          </Pressable>
        ) : null}
      </View>
      <Card>
        {rows.map((row, index) => (
          <View key={`${row.kind}-${row.userId}`} style={[styles.highlightRow, index > 0 && styles.highlightDivider]}>
            {row.kind === "first" ? (
              <>
                <View style={styles.badge}><Icon color={colors.brand} name="checkmark" size={size.icon.sm} /></View>
                <View style={styles.highlightCopy}>
                  <Text style={styles.badgeLabel}>{homeCopy.firstToRepInToday}</Text>
                  <Text style={styles.badgeName}>{personFirstName(resolveUserDisplayName({ displayName: row.displayName }))}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.avatar}><Text style={styles.avatarText}>{getUserInitials({ displayName: row.displayName })}</Text></View>
                <Text style={styles.highlightMessage}>
                  <Text style={styles.highlightName}>{personFirstName(resolveUserDisplayName({ displayName: row.displayName }))}</Text>
                  {` repped in at least ${row.count} times this week`}
                </Text>
              </>
            )}
          </View>
        ))}
      </Card>
    </View>
  );
}

export function HomeActivity({
  menuFor,
  now,
  onOpen,
  onViewAll,
  workouts,
}: {
  menuFor?: (workout: WorkoutFeedItem) => ContentMenuItem[];
  now: Date;
  onOpen: (workout: WorkoutFeedItem) => void;
  onViewAll?: () => void;
  workouts: WorkoutFeedItem[];
}) {
  return (
    <View>
      <View style={styles.activityHeader}>
        <SectionLabel>{homeCopy.activity}</SectionLabel>
        {onViewAll && workouts.length ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onViewAll}
            style={(state) => [styles.viewAllHit, webFocusRing(pressableFocused(state))]}
          >
            <Text style={styles.viewAll}>{homeCopy.viewAll}</Text>
          </Pressable>
        ) : null}
      </View>
      {workouts.length ? (
        <Card style={styles.activityCard}>
          {workouts.map((workout, index) => (
            <Pressable
              accessibilityLabel={crewPromptLine(workout, now)}
              accessibilityRole="button"
              key={workout.id}
              onPress={() => onOpen(workout)}
              style={(state) => [
                styles.promptRow,
                index > 0 && styles.promptDivider,
                webFocusRing(pressableFocused(state)),
              ]}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{getUserInitials({ displayName: workout.displayName })}</Text></View>
              <Text numberOfLines={1} style={styles.promptText}>{crewPromptLine(workout, now)}</Text>
              {menuFor?.(workout).length ? (
                <ContentOptionsMenu
                  accessibilityLabel={`Options for ${resolveUserDisplayName({ displayName: workout.displayName })}'s post`}
                  items={menuFor(workout)}
                />
              ) : null}
            </Pressable>
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyCrew}>
          <Text style={styles.emptyTitle}>{homeCopy.emptyCrewTitle}</Text>
          <Text style={styles.emptyBody}>{homeCopy.emptyCrewBody}</Text>
        </Card>
      )}
    </View>
  );
}

export function HomeLoadingSkeleton({
  cache,
  twoPane,
}: {
  cache: LastKnownLayout | null;
  twoPane: boolean;
}) {
  const activityRows = cache == null ? 1 : Math.max(0, cache.activityRowCount);
  const showHighlights = cache?.highlightsShown === true;
  const snapshot = (
    <View>
      <Card>
        <View style={styles.skelGoalRow}>
          <View style={styles.skelRing} />
          <View style={styles.skelCopy}>
            <View style={styles.skelGoalTitle} />
            <View style={styles.skelGoalNudge} />
          </View>
        </View>
        <View style={styles.skelStreak}>
          <View style={styles.skelStreakTitle} />
          <View style={styles.skelDots}>
            {Array.from({ length: 7 }, (_, index) => (
              <View key={index} style={styles.skelDotDay}>
                <View style={styles.skelDotWeekday} />
                <View style={styles.skelDotMarker}>
                  <View style={styles.skelDot} />
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.skelFooterHit} />
      </Card>
      <View style={styles.skelViewGoals} />
    </View>
  );
  const highlights = showHighlights ? (
    <View>
      <SectionLabel style={styles.highlightsLabel}>{homeCopy.highlights}</SectionLabel>
      <Card>
        <View style={styles.skelHighlightRow}>
          <View style={styles.skelAvatar} />
          <View style={styles.skelCopy}>
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </View>
        </View>
      </Card>
    </View>
  ) : null;
  const activity = (
    <View>
      <SectionLabel style={styles.activityLabel}>{homeCopy.activity}</SectionLabel>
      <Card>
        {activityRows === 0 ? null : Array.from({ length: Math.min(activityRows, twoPane ? 5 : 3) }, (_, index) => (
          <View key={index} style={styles.skelHighlightRow}>
            <View style={styles.skelAvatar} />
            <View style={styles.skelCopy}>
              <View style={styles.skelLine} />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
  return { snapshot, highlights, activity };
}

export function HomeErrorCards({
  onRetry,
  showCrewAction,
}: {
  onRetry: () => void;
  showCrewAction: boolean;
}) {
  return {
    personal: (
      <StateCard
        actionLabel={homeCopy.tryAgain}
        message={homeCopy.errorBody}
        onAction={onRetry}
        title={homeCopy.errorTitle}
      />
    ),
    crew: (
      <StateCard
        actionLabel={showCrewAction ? homeCopy.tryAgain : undefined}
        message={homeCopy.errorBody}
        onAction={showCrewAction ? onRetry : undefined}
        title={homeCopy.crewErrorTitle}
      />
    ),
  };
}

function homeStreakLabelSafe(weeks: number) {
  if (weeks <= 0) return homeCopy.noStreak;
  return homeCopy.streak(weeks);
}

const styles = StyleSheet.create({
  greeting: { color: colors.ink, ...type.display },
  skelGreeting: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: type.display.lineHeight,
    width: size.hit * 3,
  },
  goalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: progressRing.titleGap,
    minHeight: progressRing.rowHeight,
    paddingVertical: spacing.sm,
  },
  goalCopy: { flex: 1, minWidth: 0 },
  goalTitle: { color: colors.ink, ...type.body, fontFamily: fonts.bold },
  goalNudge: { color: colors.inkSoft, marginTop: spacing.xs, ...type.label },
  goalDivider: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  setGoalButton: { alignSelf: "stretch" },
  noGoal: { gap: spacing.md },
  weekCount: { color: colors.muted, ...type.bodySmall },
  streakTitle: { color: colors.ink, ...type.heading },
  streakAfterGoals: { marginTop: spacing.md },
  streakAfterEmpty: { marginTop: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  dotDay: { alignItems: "center", flex: 1 },
  dotWeekday: { color: colors.muted, ...type.micro, letterSpacing: 0.6 },
  dotWeekdayToday: { color: colors.brand },
  dotMarker: {
    alignItems: "center",
    height: homeStreakDotMarker,
    justifyContent: "center",
    marginTop: spacing.xs,
    width: homeStreakDotMarker,
  },
  dotCircle: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: homeStreakDotCircle,
    justifyContent: "center",
    width: homeStreakDotCircle,
  },
  dotCompleted: { backgroundColor: colors.brand, borderColor: colors.brand },
  dotEmpty: { backgroundColor: colors.surface, borderColor: colors.border },
  snapshotFooter: { marginTop: spacing.md },
  footerHit: { minHeight: size.hit, justifyContent: "center" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  footerLeft: { color: colors.inkSoft, flex: 1, ...type.bodySmall },
  footerRight: { color: colors.inkSoft, ...type.bodySmall },
  sectionLabel: { marginBottom: spacing.sm },
  comingUpCard: { paddingHorizontal: 0, paddingVertical: spacing.xs },
  comingUpWeek: { color: colors.inkSoft, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, ...type.bodySmall },
  comingUpWeekAfter: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewGoals: { alignSelf: "flex-end", justifyContent: "center", minHeight: size.hit },
  viewGoalsText: { color: colors.brand, ...type.label },
  crewEyebrowRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
  crewEyebrow: { color: colors.brand, ...type.heading },
  crewName: { color: colors.inkSoft, ...type.bodySmall, fontFamily: fonts.semibold },
  skelCrewChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: type.bodySmall.lineHeight,
    width: size.hit * 2 + spacing.md,
  },
  highlightsLabel: { marginBottom: spacing.sm, marginTop: spacing.lg },
  activityLabel: { marginBottom: spacing.sm, marginTop: spacing.lg },
  highlightRow: { alignItems: "center", flexDirection: "row", minHeight: size.hit, paddingVertical: spacing.sm },
  highlightDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  badge: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    height: size.highlightBadge,
    justifyContent: "center",
    width: size.highlightBadge,
  },
  badgeLabel: { color: colors.brand, ...type.label },
  badgeName: { color: colors.ink, ...type.body, fontFamily: fonts.semibold },
  highlightCopy: { flex: 1, marginLeft: spacing.md },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    height: size.avatars.sm,
    justifyContent: "center",
    width: size.avatars.sm,
  },
  avatarText: { color: colors.brand, ...type.micro },
  highlightMessage: { color: colors.inkSoft, flex: 1, marginLeft: spacing.md, ...type.bodySmall },
  highlightName: { color: colors.ink, fontFamily: fonts.semibold },
  activityHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  viewAllHit: { justifyContent: "center", minHeight: size.hit },
  viewAll: { color: colors.brand, ...type.label },
  activityCard: { paddingVertical: spacing.xs },
  promptRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: size.primary,
    paddingVertical: spacing.xs,
  },
  promptDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  promptText: { color: colors.ink, flex: 1, marginLeft: spacing.md, ...type.bodySmall },
  emptyCrew: { alignItems: "center", paddingVertical: spacing.xxl },
  emptyTitle: { color: colors.ink, textAlign: "center", ...type.heading },
  emptyBody: { color: colors.muted, marginTop: spacing.sm, textAlign: "center", ...type.bodySmall },
  skelGoalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: progressRing.titleGap,
    minHeight: progressRing.rowHeight,
  },
  skelRing: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: progressRing.diameter,
    width: progressRing.diameter,
  },
  skelCopy: { flex: 1, gap: spacing.xs },
  skelGoalTitle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: homeGoalTitleLineHeight,
    width: "70%",
  },
  skelGoalNudge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: homeGoalNudgeLineHeight,
    marginTop: spacing.xs,
    width: "55%",
  },
  skelStreak: { marginTop: spacing.md },
  skelStreakTitle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: homeStreakTitleLineHeight,
    width: "50%",
  },
  skelDots: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  skelDotDay: { alignItems: "center", flex: 1 },
  skelDotWeekday: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: type.micro.lineHeight,
    width: spacing.md,
  },
  skelDotMarker: {
    alignItems: "center",
    height: homeStreakDotMarker,
    justifyContent: "center",
    marginTop: spacing.xs,
    width: homeStreakDotMarker,
  },
  skelDot: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: homeStreakDotCircle,
    width: homeStreakDotCircle,
  },
  skelFooterHit: { height: size.hit, marginTop: spacing.md },
  skelViewGoals: { alignSelf: "flex-end", height: homeViewGoalsHeight },
  skelAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.sm,
    width: size.avatars.sm,
  },
  skelHighlightRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: size.hit,
    paddingVertical: spacing.sm,
  },
  skelLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: type.bodySmall.lineHeight,
  },
  skelShort: { width: "55%" },
});
