import {
  getUserInitials,
  personFirstName,
  resolveUserDisplayName,
  type CommunityActivityItem,
  type CommunityCrewSummary,
  type CommunityHighlights,
  type CommunityProgress,
  type CommunityProgressMember,
  type CommunityReactionType,
  type CommunityWhoReacted,
  type GroupSummary,
} from "@repin/types";
import {
  activityItemLine,
  communityHighlightRows,
  communityRevampCopy,
  groupActivityItems,
  groupWhoReacted,
  highlightCheeredLine,
  highlightConsistentLine,
  highlightCountLine,
  highlightsRowSubtitle,
  progressMembersLine,
  progressMemberStatsLine,
  progressPulseLine,
  progressTotalsLine,
  type CrewWeekQuery,
} from "@repin/validation";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Card, LoadingState, StateCard } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron } from "./icons";
import { OwnPostYouTag } from "./own-post-you-tag";
import { SegmentedControl } from "./primitives";
import { SectionLabel } from "./section-label";
import { BottomSheet } from "./sheet";
import { colors, fonts, radii, size, spacing, type } from "./theme";

function initialsFor(displayName: string) {
  return getUserInitials({ displayName });
}

function Avatar({ displayName, photoUrl, size: diameter = size.avatars.md }: {
  displayName: string;
  photoUrl?: string | null;
  size?: number;
}) {
  return (
    <View style={[styles.avatar, { height: diameter, width: diameter }]}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={[styles.avatarImage, { height: diameter, width: diameter }]} />
      ) : (
        <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
      )}
    </View>
  );
}

export function CommunityScreenTitle() {
  return <Text style={styles.screenTitle}>{communityRevampCopy.title}</Text>;
}

export function CrewHeaderStrip({
  compact,
  memberCount,
  onOpenCrew,
  onOpenSwitcher,
  photoUrl,
  selectedGroup,
}: {
  compact: boolean;
  memberCount: number;
  onOpenCrew: () => void;
  onOpenSwitcher: () => void;
  photoUrl?: string | null;
  selectedGroup: GroupSummary;
}) {
  const members = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  return (
    <Card style={styles.headerCard}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel={`Open ${selectedGroup.name} crew page`}
          accessibilityRole="button"
          onPress={onOpenCrew}
          style={(state) => [styles.photoHit, webFocusRing(pressableFocused(state)), state.pressed && styles.pressed]}
        >
          <Avatar displayName={selectedGroup.name} photoUrl={photoUrl} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Selected crew: ${selectedGroup.name}. Open crew switcher`}
          accessibilityRole="button"
          onPress={onOpenSwitcher}
          style={(state) => [styles.headerCopyHit, webFocusRing(pressableFocused(state)), state.pressed && styles.pressed]}
        >
          {compact ? (
            <View style={styles.headerOneLine}>
              <Text numberOfLines={1} style={styles.headerName}>{selectedGroup.name}</Text>
              <Text numberOfLines={1} style={styles.headerMembers}>{members}</Text>
            </View>
          ) : (
            <View style={styles.headerTwoLine}>
              <Text numberOfLines={1} style={styles.headerName}>{selectedGroup.name}</Text>
              <Text style={styles.headerMembers}>{members}</Text>
            </View>
          )}
          <Chevron />
        </Pressable>
      </View>
    </Card>
  );
}

export function CrewEntryRows({
  activitySubtitle = communityRevampCopy.last14Days,
  highlightCount,
  onOpenActivity,
  onOpenHighlights,
  onOpenProgress,
  pulse,
  selected,
}: {
  activitySubtitle?: string;
  highlightCount: number;
  onOpenActivity: () => void;
  onOpenHighlights: () => void;
  onOpenProgress: () => void;
  pulse: string;
  selected?: "progress" | "highlights" | "activity" | null;
}) {
  return (
    <Card style={styles.entryCard}>
      <EntryRow
        label={communityRevampCopy.progress}
        onPress={onOpenProgress}
        selected={selected === "progress"}
        subtitle={pulse}
      />
      {highlightCount > 0 ? (
        <EntryRow
          label={communityRevampCopy.highlights}
          onPress={onOpenHighlights}
          selected={selected === "highlights"}
          subtitle={highlightsRowSubtitle(highlightCount)}
        />
      ) : null}
      <EntryRow
        last
        label={communityRevampCopy.activity}
        onPress={onOpenActivity}
        selected={selected === "activity"}
        subtitle={activitySubtitle}
      />
    </Card>
  );
}

function EntryRow({
  label,
  last = false,
  onPress,
  selected = false,
  subtitle,
}: {
  label: string;
  last?: boolean;
  onPress: () => void;
  selected?: boolean;
  subtitle: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}, ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [
        styles.entryRow,
        selected && styles.entrySelected,
        !last && styles.entryDivider,
        webFocusRing(pressableFocused(state)),
        state.pressed && styles.pressed,
      ]}
    >
      <View style={styles.entryCopy}>
        <Text style={styles.entryLabel}>{label}</Text>
        <Text style={styles.entrySubtitle}>{subtitle}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

export function CrewSwitcherSheet({
  groups,
  onDismiss,
  onOpenCrew,
  onSelectGroup,
  selectedGroupId,
  visible,
}: {
  groups: GroupSummary[];
  onDismiss: () => void;
  onOpenCrew: () => void;
  onSelectGroup: (groupId: string) => void;
  selectedGroupId: string;
  visible: boolean;
}) {
  return (
    <BottomSheet closeLabel="Close crew switcher" onDismiss={onDismiss} title={communityRevampCopy.switchCrew} visible={visible}>
      <View style={styles.switcherList}>
        {groups.map((group) => {
          const selected = group.id === selectedGroupId;
          const members = group.memberCount != null
            ? `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`
            : null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={group.id}
              onPress={() => onSelectGroup(group.id)}
              style={(state) => [
                styles.switcherRow,
                selected && styles.switcherSelected,
                webFocusRing(pressableFocused(state)),
                state.pressed && styles.pressed,
              ]}
            >
              <Avatar displayName={group.name} photoUrl={group.photoUrl} />
              <View style={styles.switcherCopy}>
                <Text numberOfLines={1} style={styles.switcherName}>{group.name}</Text>
                {members ? <Text style={styles.switcherMembers}>{members}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenCrew}
        style={(state) => [styles.viewCrewRow, webFocusRing(pressableFocused(state)), state.pressed && styles.pressed]}
      >
        <Text style={styles.viewCrew}>{communityRevampCopy.viewCrew}</Text>
        <Chevron />
      </Pressable>
    </BottomSheet>
  );
}

export function WhoReactedSheet({
  data,
  error,
  focus,
  loading,
  onDismiss,
  onRetry,
  visible,
}: {
  data: CommunityWhoReacted | null;
  error: string | null;
  focus?: CommunityReactionType;
  loading: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  visible: boolean;
}) {
  const groups = data ? groupWhoReacted(data, focus) : [];
  return (
    <BottomSheet onDismiss={onDismiss} title={communityRevampCopy.reactions} visible={visible}>
      {loading ? (
        <LoadingState message="" />
      ) : error ? (
        <StateCard
          actionLabel={communityRevampCopy.tryAgain}
          message={communityRevampCopy.errorBody}
          onAction={onRetry}
          title={communityRevampCopy.loadPost}
        />
      ) : (
        groups.map((group) => (
          <View key={group.reactionType} style={styles.whoGroup}>
            <Text style={styles.whoHeading}>
              {`${group.emoji}  ${group.label}  ·  ${group.reactors.length}`}
            </Text>
            {group.reactors.map((reactor) => (
              <View key={reactor.userId} style={styles.whoRow}>
                <Avatar displayName={reactor.displayName} size={size.avatars.sm} />
                <Text numberOfLines={1} style={styles.whoName}>
                  {resolveUserDisplayName({ displayName: reactor.displayName })}
                </Text>
                {reactor.isYou ? <OwnPostYouTag /> : null}
              </View>
            ))}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

export function CrewProgressView({
  compactTitle = false,
  onRetry,
  progress,
  state,
}: {
  compactTitle?: boolean;
  onRetry: () => void;
  progress: CommunityProgress | null;
  state: "loading" | "error" | "ready";
}) {
  return (
    <View>
      {compactTitle ? <Text style={styles.paneTitle}>{communityRevampCopy.progress}</Text> : null}
      {state === "loading" ? <ProgressSkeleton /> : null}
      {state === "error" ? (
        <StateCard
          actionLabel={communityRevampCopy.tryAgain}
          message={communityRevampCopy.errorBody}
          onAction={onRetry}
          title={communityRevampCopy.loadProgress}
        />
      ) : null}
      {state === "ready" && progress ? <CrewProgressCard progress={progress} /> : null}
    </View>
  );
}

export function CrewProgressCard({ progress }: { progress: CommunityProgress }) {
  return (
    <Card>
      <Text style={styles.progressHeadline}>
        {progressMembersLine(progress.activeMembers, progress.memberCount)}
      </Text>
      <Text style={styles.progressTotals}>
        {progressTotalsLine({
          recordedMeters: progress.recordedMeters,
          recordedSeconds: progress.recordedSeconds,
          sharedWorkouts: progress.sharedWorkouts,
        })}
      </Text>
      <View accessibilityRole="list" style={styles.weekRow}>
        {progress.days.map((day) => (
          <View
            accessibilityLabel={`${day.weekday}, ${day.activeMembers} members`}
            accessible
            key={`${day.weekday}-${day.weekdayIndex}`}
            style={styles.weekDay}
          >
            <Text style={[styles.weekLetter, day.isToday && styles.weekLetterToday]}>{day.weekday}</Text>
            <View style={[styles.weekMark, day.isToday && styles.weekMarkToday]}>
              <Text style={styles.weekCount}>
                {day.isFuture || day.activeMembers <= 0 ? "–" : String(day.activeMembers)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {progress.members.map((member) => (
        <CrewMemberWeekRow key={member.userId} member={member} />
      ))}
    </Card>
  );
}

export function CrewMemberWeekRow({ member }: { member: CommunityProgressMember }) {
  const name = resolveUserDisplayName({ displayName: member.displayName });
  return (
    <View style={styles.memberRow}>
      <Avatar displayName={member.displayName} size={size.avatars.sm} />
      <View style={styles.memberCopy}>
        <View style={styles.memberNameRow}>
          <Text numberOfLines={1} style={styles.memberName}>{name}</Text>
          {member.isYou ? <OwnPostYouTag /> : null}
          {member.isOwner ? <Text style={styles.ownerLabel}>{communityRevampCopy.owner}</Text> : null}
        </View>
        <Text style={styles.memberStats}>{progressMemberStatsLine(member.workouts, member.days)}</Text>
      </View>
    </View>
  );
}

export function CrewHighlightsView({
  compactTitle = false,
  crewSize,
  highlights,
  onChangeWeek,
  onOpenPost,
  onRetry,
  state,
  week,
}: {
  compactTitle?: boolean;
  crewSize: number;
  highlights: CommunityHighlights | null;
  onChangeWeek: (week: CrewWeekQuery) => void;
  onOpenPost?: (input: { postId: string; sessionId: string | null }) => void;
  onRetry: () => void;
  state: "loading" | "error" | "ready";
  week: CrewWeekQuery;
}) {
  const rows = highlights ? communityHighlightRows(highlights, { crewSize, week }) : [];
  return (
    <View>
      {compactTitle ? <Text style={styles.paneTitle}>{communityRevampCopy.highlights}</Text> : null}
      {state === "loading" ? <HighlightsSkeleton /> : null}
      {state === "error" ? (
        <StateCard
          actionLabel={communityRevampCopy.tryAgain}
          message={communityRevampCopy.errorBody}
          onAction={onRetry}
          title={communityRevampCopy.loadHighlights}
        />
      ) : null}
      {state === "ready" ? (
        <Card>
          <SegmentedControl
            accessibilityLabel="Highlights week"
            onChange={(value) => {
              if (value) onChangeWeek(value);
            }}
            options={[
              { label: communityRevampCopy.thisWeek, value: "current" },
              { label: communityRevampCopy.lastWeek, value: "previous" },
            ]}
            size="sm"
            style={styles.weekToggle}
            value={week}
          />
          {rows.length ? rows.map((row, index) => {
            const name = personFirstName(resolveUserDisplayName({ displayName: row.displayName }));
            const subtitle = row.kind === "first"
              ? communityRevampCopy.firstToRepInToday
              : row.kind === "count"
                ? highlightCountLine(name, row.count)
                : row.kind === "consistent"
                  ? highlightConsistentLine(row.count)
                  : row.kind === "pr"
                    ? communityRevampCopy.sharedPr
                    : row.kind === "goal"
                      ? communityRevampCopy.sharedGoal
                      : highlightCheeredLine(row.title);
            return (
              <Pressable
                disabled={row.kind !== "cheered" || !onOpenPost}
                key={`${row.kind}-${row.userId}-${index}`}
                onPress={() => {
                  if (row.kind === "cheered") onOpenPost?.({ postId: row.postId, sessionId: row.sessionId });
                }}
                style={[styles.highlightRow, index > 0 && styles.highlightDivider]}
              >
                <Avatar displayName={row.displayName} size={size.avatars.sm} />
                <View style={styles.highlightCopy}>
                  <Text style={styles.highlightName}>{name}</Text>
                  <Text style={styles.highlightSubtitle}>{subtitle}</Text>
                </View>
              </Pressable>
            );
          }) : (
            <Text style={styles.emptyCopy}>{communityRevampCopy.emptyHighlights}</Text>
          )}
        </Card>
      ) : null}
    </View>
  );
}

export function CrewActivityView({
  compactTitle = false,
  items,
  now,
  onOpenItem,
  onRetry,
  state,
  timeZone,
}: {
  compactTitle?: boolean;
  items: CommunityActivityItem[];
  now: Date;
  onOpenItem?: (item: CommunityActivityItem) => void;
  onRetry: () => void;
  state: "loading" | "error" | "ready";
  timeZone: string;
}) {
  const grouped = groupActivityItems(items, now, timeZone);
  return (
    <View>
      {compactTitle ? <Text style={styles.paneTitle}>{communityRevampCopy.activityTitle}</Text> : null}
      {state === "loading" ? <ActivitySkeleton /> : null}
      {state === "error" ? (
        <StateCard
          actionLabel={communityRevampCopy.tryAgain}
          message={communityRevampCopy.errorBody}
          onAction={onRetry}
          title={communityRevampCopy.loadActivity}
        />
      ) : null}
      {state === "ready" && !items.length ? (
        <Card>
          <Text style={styles.emptyCopy}>{communityRevampCopy.emptyActivity}</Text>
        </Card>
      ) : null}
      {state === "ready" && items.length ? (
        <View>
          {grouped.fresh.length ? (
            <View>
              <SectionLabel style={styles.activityLabel}>{communityRevampCopy.new}</SectionLabel>
              <Card>
                {grouped.fresh.map((item, index) => (
                  <ActivityRow
                    divider={index > 0}
                    item={item}
                    key={item.id}
                    now={now}
                    onPress={onOpenItem}
                  />
                ))}
              </Card>
            </View>
          ) : null}
          {grouped.earlier.length ? (
            <View>
              <SectionLabel style={styles.activityLabel}>{communityRevampCopy.earlier}</SectionLabel>
              <Card>
                {grouped.earlier.map((item, index) => (
                  <ActivityRow
                    divider={index > 0}
                    item={item}
                    key={item.id}
                    now={now}
                    onPress={onOpenItem}
                  />
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ActivityRow({
  divider,
  item,
  now,
  onPress,
}: {
  divider: boolean;
  item: CommunityActivityItem;
  now: Date;
  onPress?: (item: CommunityActivityItem) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress?.(item)}
      style={(state) => [
        styles.activityRow,
        divider && styles.activityDivider,
        webFocusRing(pressableFocused(state)),
        state.pressed && styles.pressed,
      ]}
    >
      <Avatar displayName={item.actorDisplayName} size={size.avatars.sm} />
      <Text style={styles.activityLine}>{activityItemLine(item, now)}</Text>
    </Pressable>
  );
}

export function CommunityBoardLabel() {
  return <SectionLabel style={styles.boardLabel}>{communityRevampCopy.board}</SectionLabel>;
}

export function CommunityLoadingSkeleton({ twoPane }: { twoPane: boolean }) {
  return (
    <View>
      <CommunityScreenTitle />
      <Card style={styles.skelCard}>
        <View style={styles.skelRow}>
          <View style={styles.skelAvatar} />
          <View style={styles.skelCopy}>
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </View>
        </View>
      </Card>
      <Card style={styles.skelCard}>
        <View style={styles.skelLine} />
        <View style={[styles.skelLine, styles.skelShort]} />
        <View style={styles.skelLine} />
      </Card>
      <CommunityBoardLabel />
      <Card style={styles.skelCard}>
        <View style={styles.skelRow}>
          <View style={styles.skelAvatar} />
          <View style={styles.skelCopy}>
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </View>
        </View>
      </Card>
      {twoPane ? (
        <Card style={styles.skelCard}>
          <View style={styles.skelLine} />
          <View style={styles.skelLine} />
        </Card>
      ) : null}
    </View>
  );
}

function ProgressSkeleton() {
  return (
    <Card style={styles.skelCard}>
      <View style={styles.skelLine} />
      <View style={[styles.skelLine, styles.skelShort]} />
      <View style={styles.skelDots}>
        {Array.from({ length: 7 }, (_, index) => <View key={index} style={styles.skelDot} />)}
      </View>
    </Card>
  );
}

function HighlightsSkeleton() {
  return (
    <Card style={styles.skelCard}>
      <View style={styles.skelRow}>
        <View style={styles.skelAvatar} />
        <View style={styles.skelCopy}>
          <View style={styles.skelLine} />
        </View>
      </View>
    </Card>
  );
}

function ActivitySkeleton() {
  return HighlightsSkeleton();
}

export function CommunityErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard
      actionLabel={communityRevampCopy.tryAgain}
      message={communityRevampCopy.errorBody}
      onAction={onRetry}
      title={communityRevampCopy.loadCommunity}
    />
  );
}

export function communityPulseFromSummary(crew: CommunityCrewSummary | null | undefined) {
  if (!crew) return communityRevampCopy.emptyPulse;
  return progressPulseLine(crew.weekPulse.activeMembers, crew.memberCount);
}

const styles = StyleSheet.create({
  screenTitle: { color: colors.ink, ...type.screenTitle },
  paneTitle: { color: colors.ink, marginBottom: spacing.md, ...type.screenTitle },
  headerCard: { marginTop: spacing.md, padding: spacing.md },
  headerRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  photoHit: {
    alignItems: "center",
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  headerCopyHit: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    minHeight: size.hit,
  },
  headerOneLine: {
    alignItems: "baseline",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  headerTwoLine: { flex: 1, minWidth: 0 },
  headerName: { color: colors.ink, flexShrink: 1, ...type.heading },
  headerMembers: { color: colors.muted, ...type.bodySmall },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { borderRadius: radii.pill },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: type.label.fontSize },
  entryCard: { marginTop: spacing.md, overflow: "hidden", padding: 0 },
  entryRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: size.hit + spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entrySelected: { backgroundColor: colors.brandTint },
  entryDivider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryCopy: { flex: 1, minWidth: 0 },
  entryLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  entrySubtitle: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  switcherList: { gap: spacing.xs },
  switcherRow: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: size.hit,
    padding: spacing.md,
  },
  switcherSelected: { backgroundColor: colors.brandTint },
  switcherCopy: { flex: 1, minWidth: 0 },
  switcherName: { color: colors.ink, ...type.bodyMedium, fontFamily: fonts.bold },
  switcherMembers: { color: colors.muted, ...type.bodySmall },
  viewCrewRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: size.hit,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  viewCrew: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  whoGroup: { marginBottom: spacing.lg },
  whoHeading: { color: colors.brand, fontFamily: fonts.bold, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, marginBottom: spacing.sm },
  whoRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: size.hit },
  whoName: { color: colors.ink, flexShrink: 1, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  progressHeadline: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  progressTotals: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  weekDay: { alignItems: "center", minWidth: size.avatars.xs + spacing.sm },
  weekLetter: { color: colors.muted, fontFamily: fonts.extrabold, fontSize: type.calendarWeekday.fontSize, lineHeight: type.calendarWeekday.lineHeight },
  weekLetterToday: { color: colors.brand },
  weekMark: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: size.hit - spacing.md,
    justifyContent: "center",
    marginTop: spacing.xs,
    minWidth: size.hit - spacing.md,
  },
  weekMarkToday: { borderColor: colors.brand, borderWidth: 2 },
  weekCount: { color: colors.brand, fontFamily: fonts.bold, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight },
  memberRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minWidth: 0 },
  memberName: { color: colors.ink, flexShrink: 1, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  ownerLabel: { color: colors.muted, ...type.bodySmall },
  memberStats: { color: colors.muted, marginTop: spacing.xs / 2, ...type.bodySmall },
  weekToggle: { alignSelf: "stretch", marginBottom: spacing.md },
  highlightRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: size.hit, paddingVertical: spacing.sm },
  highlightDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  highlightCopy: { flex: 1, minWidth: 0 },
  highlightName: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  highlightSubtitle: { color: colors.muted, ...type.bodySmall },
  emptyCopy: { color: colors.muted, paddingVertical: spacing.md, ...type.bodySmall },
  activityLabel: { marginBottom: spacing.sm, marginTop: spacing.lg },
  activityRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: size.hit, paddingVertical: spacing.sm },
  activityDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  activityLine: { color: colors.ink, flex: 1, fontFamily: fonts.medium, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight },
  boardLabel: { marginBottom: spacing.sm, marginTop: spacing.lg },
  skelCard: { marginTop: spacing.md },
  skelRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  skelAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.md,
    width: size.avatars.md,
  },
  skelCopy: { flex: 1, gap: spacing.sm },
  skelLine: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, height: spacing.md },
  skelShort: { width: "40%" },
  skelDots: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  skelDot: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.xs,
    width: size.avatars.xs,
  },
  pressed: { opacity: 0.72 },
});
