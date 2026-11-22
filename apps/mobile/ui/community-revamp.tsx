import {
  getUserInitials,
  personFirstName,
  resolveUserDisplayName,
  type CommunityActivityItem,
  type CommunityHighlights,
  type CommunityReactionType,
  type CommunityWhoReacted,
  type GroupSummary,
} from "@repin/types";
import {
  activityEntryLabel,
  activityItemLine,
  communityHighlightRows,
  communityRevampCopy,
  ENTRY_ROW_DIVIDER_INSET,
  ENTRY_ROW_HALF_INSET,
  ENTRY_ROW_HEIGHT,
  ENTRY_ROW_PAIR_GAP,
  formatEntryCount,
  generalPostCopy,
  groupActivityItems,
  groupWhoReacted,
  highlightCheeredLine,
  highlightConsistentLine,
  highlightCountLine,
  highlightsEntryLabel,
  type CrewWeekQuery,
} from "@repin/validation";
import { type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, LoadingState, StateCard } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { StaleBanner } from "./home";
import { Chevron } from "./icons";
import { OwnPostYouTag } from "./own-post-you-tag";
import { SegmentedControl } from "./primitives";
import { SectionLabel } from "./section-label";
import { BottomSheet } from "./sheet";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import type { LastKnownLayout } from "../lib/last-known-layout";

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

export const crewHeaderStripPadding = spacing.md;
export const crewHeaderStripRowMinHeight = size.hit;
export const crewHeaderStripCompactHeight = crewHeaderStripPadding * 2 + crewHeaderStripRowMinHeight;
export const crewHeaderStripTwoLineCopyHeight = type.heading.lineHeight + type.bodySmall.lineHeight;
export const crewHeaderStripTwoLineHeight = crewHeaderStripPadding * 2
  + Math.max(crewHeaderStripRowMinHeight, crewHeaderStripTwoLineCopyHeight);
export const communityEntryRowHeight = ENTRY_ROW_HEIGHT;
export const communityEntryRowGap = spacing.sm;
export const communityBoardLabelGap = spacing.md;

export function CrewEntryRows({
  activityCount,
  highlightCount,
  onOpenActivity,
  onOpenHighlights,
  selected = null,
}: {
  activityCount: number;
  highlightCount: number;
  onOpenActivity: () => void;
  onOpenHighlights: () => void;
  selected?: "highlights" | "activity" | null;
}) {
  return (
    <Card style={styles.entryCard}>
      <View style={styles.entryRow}>
        <EntryHalf
          accessibilityLabel={highlightsEntryLabel(highlightCount)}
          count={highlightCount}
          edge="start"
          label={communityRevampCopy.highlights}
          onPress={onOpenHighlights}
          selected={selected === "highlights"}
        />
        <View pointerEvents="none" style={styles.entryDivider} />
        <EntryHalf
          accessibilityLabel={activityEntryLabel(activityCount)}
          count={activityCount}
          edge="end"
          label={communityRevampCopy.activity}
          onPress={onOpenActivity}
          selected={selected === "activity"}
        />
      </View>
    </Card>
  );
}

function EntryHalf({
  accessibilityLabel,
  count,
  edge,
  label,
  onPress,
  selected,
}: {
  accessibilityLabel: string;
  count: number;
  edge: "start" | "end";
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const active = state.pressed || selected;
        return [
          styles.entryHalf,
          edge === "start" ? styles.entryHalfStart : styles.entryHalfEnd,
          active && styles.entryHalfSelected,
          webFocusRing(pressableFocused(state)),
        ];
      }}
    >
      {(state) => {
        const active = state.pressed || selected;
        return (
          <>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={type.ringLabel.fontSize / type.body.fontSize}
              numberOfLines={1}
              style={[styles.entryNumber, active && styles.entrySelectedType]}
            >
              {formatEntryCount(count)}
            </Text>
            <Text numberOfLines={1} style={[styles.entryLabel, active && styles.entrySelectedType]}>{label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

export function CommunityBoardHeader({
  compact,
  entryRow,
  memberCount,
  newPostGap,
  onNewPost,
  onOpenCrew,
  onOpenSwitcher,
  onRetryStale,
  photoUrl,
  selectedGroup,
  staleAt,
}: {
  compact: boolean;
  entryRow: ReactNode;
  memberCount: number;
  newPostGap: number;
  onNewPost: () => void;
  onOpenCrew: () => void;
  onOpenSwitcher: () => void;
  onRetryStale: () => void;
  photoUrl?: string | null;
  selectedGroup: GroupSummary;
  staleAt: string | null;
}) {
  return (
    <View>
      <CommunityScreenTitle />
      {staleAt ? <StaleBanner onRetry={onRetryStale} time={staleAt} /> : null}
      <CrewHeaderStrip
        compact={compact}
        memberCount={memberCount}
        onOpenCrew={onOpenCrew}
        onOpenSwitcher={onOpenSwitcher}
        photoUrl={photoUrl}
        selectedGroup={selectedGroup}
      />
      {entryRow}
      <CommunityBoardLabel />
      <CommunityNewPostButton gap={newPostGap} onPress={onNewPost} />
    </View>
  );
}

export function CommunityNewPostButton({ gap, onPress }: { gap: number; onPress: () => void }) {
  return (
    <Button
      accessibilityLabel={generalPostCopy.newPost}
      icon="pencil"
      onPress={onPress}
      style={{ ...styles.newPost, marginBottom: gap, marginTop: gap }}
      variant="compact-primary"
    >
      {generalPostCopy.newPost}
    </Button>
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

export function CommunityLoadingSkeleton({
  cache,
  compact,
}: {
  cache: LastKnownLayout | null;
  compact: boolean;
}) {
  const headerHeight = compact ? crewHeaderStripCompactHeight : crewHeaderStripTwoLineHeight;
  const showPinned = cache?.pinnedPostShown === true;
  return (
    <View>
      <CommunityScreenTitle />
      <Card style={[styles.headerCard, { minHeight: headerHeight }]}>
        <View style={styles.skelHeaderRow}>
          <View style={styles.skelAvatar} />
          <View style={styles.skelCopy}>
            <View style={styles.skelCrewName} />
            {compact ? null : <View style={[styles.skelLine, styles.skelShort]} />}
          </View>
        </View>
      </Card>
      <Card style={styles.entryCard}>
        <View style={styles.entryRow}>
          <View style={styles.entryHalf}>
            <View style={styles.skelEntryPair} />
          </View>
          <View pointerEvents="none" style={styles.entryDivider} />
          <View style={styles.entryHalf}>
            <View style={styles.skelEntryPair} />
          </View>
        </View>
      </Card>
      <CommunityBoardLabel />
      <View style={styles.skelNewPost} />
      {showPinned ? (
        <Card style={styles.skelPostCard}>
          <View style={styles.skelRow}>
            <View style={styles.skelAvatar} />
            <View style={styles.skelCopy}>
              <View style={styles.skelLine} />
              <View style={[styles.skelLine, styles.skelShort]} />
            </View>
          </View>
        </Card>
      ) : null}
      <Card style={styles.skelPostCard}>
        <View style={styles.skelRow}>
          <View style={styles.skelAvatar} />
          <View style={styles.skelCopy}>
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </View>
        </View>
      </Card>
    </View>
  );
}

function HighlightsSkeleton() {
  return (
    <Card style={styles.skelPostCard}>
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

const styles = StyleSheet.create({
  screenTitle: { color: colors.ink, ...type.screenTitle },
  paneTitle: { color: colors.ink, marginBottom: spacing.md, ...type.screenTitle },
  headerCard: { marginTop: spacing.md, padding: crewHeaderStripPadding },
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
  entryCard: { marginTop: communityEntryRowGap, overflow: "hidden", padding: 0 },
  entryRow: {
    flexDirection: "row",
    height: communityEntryRowHeight,
    overflow: "hidden",
    position: "relative",
  },
  entryHalf: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: ENTRY_ROW_PAIR_GAP,
    height: communityEntryRowHeight,
    justifyContent: "center",
    paddingHorizontal: ENTRY_ROW_HALF_INSET,
  },
  entryHalfStart: {
    borderBottomLeftRadius: radii.lg,
    borderTopLeftRadius: radii.lg,
  },
  entryHalfEnd: {
    borderBottomRightRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  entryHalfSelected: { backgroundColor: colors.brandTint },
  entryDivider: {
    backgroundColor: colors.border,
    bottom: ENTRY_ROW_DIVIDER_INSET,
    left: "50%",
    marginLeft: -0.5,
    position: "absolute",
    top: ENTRY_ROW_DIVIDER_INSET,
    width: 1,
  },
  entryNumber: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: type.body.fontSize,
    lineHeight: type.body.fontSize,
  },
  entryLabel: {
    color: colors.muted,
    fontFamily: fonts.semibold,
    fontSize: type.calendarWeekday.fontSize,
    lineHeight: type.calendarWeekday.lineHeight,
  },
  entrySelectedType: { color: colors.brandPressed },
  newPost: { alignSelf: "stretch", width: "100%" },
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
  boardLabel: { marginBottom: spacing.sm, marginTop: communityBoardLabelGap },
  skelHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: crewHeaderStripRowMinHeight,
  },
  skelCrewName: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: type.heading.lineHeight,
    width: "40%",
  },
  skelEntryPair: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: type.body.fontSize,
    width: "55%",
  },
  skelNewPost: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    height: size.hit,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  skelPostCard: { marginTop: spacing.md },
  skelRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  skelAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.md,
    width: size.avatars.md,
  },
  skelCopy: { flex: 1, gap: spacing.sm },
  skelLine: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, height: type.body.lineHeight },
  skelShort: { width: "40%" },
  pressed: { opacity: 0.72 },
});
