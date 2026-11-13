import { getUserInitials, resolveUserDisplayName, workoutTypeLabels, type WorkoutFeedItem } from "@repin/types";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { StyleProp, ViewInstance, ViewProps, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useVerticalBarEdge } from "./vertical-bar-edge";
import {
  communityFeedCardLayout,
  isOwnPost,
  ownPostAuthorNameRowStyle,
  ownPostAuthorNameStyle,
  workoutFeedCardLabel,
} from "./community-feed-layout";
import { OwnPostYouTag } from "./own-post-you-tag";
import { anchoredScrollOffset, topVisibleAnchor } from "./layout-math";
import { readStoredScrollAnchor, writeStoredScrollAnchor } from "./scroll-anchor";

import repinLockup from "../assets/branding/repin-lockup.png";
import repinLockupReversed from "../assets/branding/repin-lockup-reversed.png";
import repinMark from "../assets/branding/repin-mark.png";
import { postMenuItems, workoutMenuItems, type ContentMenuItem } from "../lib/content-menu";
import { formatWorkoutDate } from "../lib/workout-date";
import { PrBadgeRow } from "./pr-badges";
import { WideColumn } from "./layout";
import { pressableFocused, webFocusRing } from "./focus-ring";
import {
  buttonAppearance,
  buttonShowsDisabledReason,
  controlHelperGap,
  type ButtonVariant,
} from "./primitive-state";
import { Icon, type IconName } from "./icons";
import { Menu, MenuItem } from "./menu";
import { menuPopoverWidth, stateActionHeight, stateIconSize } from "./overlay-state";
import { useOverlayOccupancy } from "./use-overlay-occupancy";
import { keyboardScrollProps } from "./keyboard";
import { colors, elevation, fonts, radii, size, spacing, type } from "./theme";
import { WorkoutPhoto } from "./workout-photo";

const webFeedScrollerStyle =
  Platform.OS === "web"
    ? ({
        WebkitOverflowScrolling: "touch",
        overflowX: "hidden",
        overflowY: "auto",
        overscrollBehaviorY: "contain",
        touchAction: "pan-y",
      } as ViewStyle)
    : undefined;

export function Wordmark({
  decorative = false,
  size = type.title.fontSize,
  tone = "default",
}: {
  decorative?: boolean;
  size?: number;
  tone?: "default" | "onBrand";
}) {
  const onBrand = tone === "onBrand";
  return (
    <Text
      accessibilityLabel={decorative ? undefined : "repin"}
      accessible={decorative ? false : undefined}
      style={[
        styles.wordmark,
        { fontFamily: fonts.display },
        {
          color: onBrand ? colors.surface : colors.ink,
          fontSize: size,
          letterSpacing: size * -0.02,
          lineHeight: Math.round(size * 1.32),
        },
      ]}
    >
      rep
      <Text accessible={decorative ? false : undefined} style={[styles.wordmark, { color: onBrand ? colors.ink : colors.brand, fontFamily: fonts.display }]}>in</Text>
    </Text>
  );
}

export function Lockup({ tone = "default" }: { tone?: "default" | "onBrand" }) {
  const onBrand = tone === "onBrand";
  return (
    <Image
      accessibilityLabel="repin"
      accessible
      resizeMode="contain"
      source={onBrand ? repinLockupReversed : repinLockup}
      style={styles.lockup}
    />
  );
}

export function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <Image
        accessible={false}
        resizeMode="contain"
        source={repinMark}
        style={styles.brandHeaderMark}
      />
      <Wordmark />
    </View>
  );
}

export function Screen({
  children,
  preserveTransformedContent = false,
}: {
  children: ReactNode;
  preserveTransformedContent?: boolean;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <ScrollView
        {...keyboardScrollProps(Platform.OS)}
        contentContainerStyle={styles.screenScroll}
        nestedScrollEnabled
        removeClippedSubviews={false}
        style={[styles.screenBleed, preserveTransformedContent ? styles.overflowVisible : null]}
      >
        <SafeAreaView edges={["left", "right"]} style={styles.sideInset}>
          <WideColumn>
          <View
            style={[
              styles.screenContent,
              preserveTransformedContent && styles.transformedScreenContent,
            ]}
          >
            {children}
          </View>
          </WideColumn>
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Button({
  children,
  disabled = false,
  disabledReason,
  labelColor,
  loading = false,
  loadingLabel,
  onPress,
  variant = "primary",
  style,
}: {
  children: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Enabled-label override. Disabled and loading keep the variant colour. */
  labelColor?: string;
  loading?: boolean;
  loadingLabel?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  style?: ViewStyle;
}) {
  const showHelper = buttonShowsDisabledReason(disabled, loading, disabledReason);
  const resting = buttonAppearance({ disabled, loading, pressed: false, variant });
  const textColor = !disabled && !loading && labelColor ? labelColor : resting.color;
  const label = loading ? (loadingLabel ?? children) : children;
  return (
    <View>
      <Pressable
        accessibilityHint={showHelper ? disabledReason : undefined}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: disabled || loading }}
        disabled={disabled || loading}
        onPress={onPress}
        style={(state) => {
          const appearance = buttonAppearance({ disabled, loading, pressed: state.pressed, variant });
          return [
            styles.button,
            {
              backgroundColor: appearance.backgroundColor,
              borderColor: appearance.borderColor,
              borderWidth: appearance.borderWidth,
              height: appearance.height,
              minHeight: appearance.height,
            },
            webFocusRing(pressableFocused(state)),
            style,
          ];
        }}
      >
        <View style={styles.buttonContent}>
          {resting.showSpinner ? (
            <ActivityIndicator
              accessibilityElementsHidden
              color={textColor}
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
        </View>
      </Pressable>
      {showHelper ? <Text accessibilityLiveRegion="polite" style={styles.buttonHelper}>{disabledReason}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  selected = false,
  style,
  ...rest
}: ViewProps & { selected?: boolean }) {
  return (
    <View {...rest} style={[styles.card, selected && styles.cardSelected, style]}>
      {children}
    </View>
  );
}

export { TextField } from "./form-fields";

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function StateCard({
  actionLabel,
  icon,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  icon?: IconName;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <Card style={styles.stateCard}>
      {icon ? (
        <View style={styles.stateIcon}>
          <Icon color={colors.ink} name={icon} size={stateIconSize} />
        </View>
      ) : null}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.bodyMuted}>{message}</Text>
      {actionLabel && onAction ? (
        <Button onPress={onAction} style={styles.stateAction} variant="secondary">{actionLabel}</Button>
      ) : null}
    </Card>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.loadingState}>
      <Card style={styles.stateCard}>
        <View style={styles.stateIcon}>
          <ActivityIndicator color={colors.brand} />
        </View>
        <Text style={styles.bodyMuted}>{message}</Text>
      </Card>
    </View>
  );
}

export function WorkoutSummaryCard({
  isOwn = false,
  menuItems,
  onDelete,
  onEdit,
  selected = false,
  showCommentCount = false,
  showReactionSummary = false,
  style,
  variant = "full",
  workout,
}: {
  isOwn?: boolean;
  menuItems?: ContentMenuItem[];
  onDelete?: () => void;
  onEdit?: () => void;
  selected?: boolean;
  showCommentCount?: boolean;
  showReactionSummary?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: "compact" | "full";
  workout: WorkoutFeedItem;
}) {
  const displayName = resolveUserDisplayName({ displayName: workout.displayName });
  const typeLabel = formatWorkoutType(workout.workoutType);
  const canonicalName = workout.name?.trim();
  const legacyTitle = workout.title?.trim();
  const title = canonicalName || legacyTitle || typeLabel;
  const showTypeChip = Boolean(typeLabel && normalizeLabel(title) !== normalizeLabel(typeLabel));
  const resultSummary = workout.resultSummary?.trim() || null;
  const duration = !resultSummary && workout.durationMinutes && workout.durationMinutes > 0 ? `${workout.durationMinutes} min` : null;
  const effort = workout.effort && workout.effort >= 1 && workout.effort <= 5
    ? "🔥".repeat(workout.effort)
    : null;
  const caption = workout.caption?.trim() || workout.notes?.trim();
  const reactionSummary = showReactionSummary && workout.reactionCounts
    ? ([
        ["🔥", workout.reactionCounts.fire],
        ["💪", workout.reactionCounts.strong],
        ["👏", workout.reactionCounts.clap],
      ] as const).filter(([, value]) => value > 0)
    : [];
  const reactionTotal = reactionSummary.reduce((sum, [, value]) => sum + value, 0);
  const resolvedMenuItems = menuItems ?? (onEdit && onDelete
    ? postMenuItems({ onDelete, onEdit })
    : []);
  const socialSummary = [
    ...(reactionSummary.length
      ? [{ accessibility: `${reactionTotal} reaction${reactionTotal === 1 ? "" : "s"}`, text: reactionSummary.map(([emoji, value]) => `${emoji} ${value}`).join("   ") }]
      : []),
    ...(showCommentCount && (workout.commentCount ?? 0) > 0
      ? [{ accessibility: `${workout.commentCount} comment${workout.commentCount === 1 ? "" : "s"}`, text: `💬 ${workout.commentCount}` }]
      : []),
  ];

  return (
    <View style={styles.workoutCardWrap}>
      <Card selected={selected} style={[variant === "compact" ? styles.compactWorkoutCard : styles.fullWorkoutCard, style]}>
        <View style={styles.workoutTopline}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{getUserInitials({ displayName: workout.displayName })}</Text></View>
          <View style={styles.workoutAuthor}>
            <View style={styles.authorNameRow}>
              <Text numberOfLines={1} style={styles.author}>{displayName}</Text>
              {isOwn ? <OwnPostYouTag /> : null}
            </View>
            <Text style={styles.timestamp}>{formatWorkoutDate(workout)}</Text>
          </View>
          {showTypeChip ? <View style={styles.typePill}><Text style={styles.typeText}>{typeLabel}</Text></View> : null}
          {resolvedMenuItems.length ? (
            <ContentOptionsMenu
              accessibilityLabel={`Options for ${displayName}'s post`}
              items={resolvedMenuItems}
            />
          ) : null}
        </View>
        <Text numberOfLines={variant === "compact" ? 1 : 2} style={[styles.workoutTitle, variant === "compact" && styles.compactWorkoutTitle]}>{title}</Text>
        {duration || effort ? <Text numberOfLines={1} style={styles.workoutMetadata}>{[duration, effort].filter(Boolean).join("  ·  ")}</Text> : null}
        {resultSummary || workout.prBadges?.length || workout.goalBadges?.length ? (
          <View style={styles.resultRow}>
            {resultSummary ? <Text numberOfLines={1} style={styles.workoutResultSummary}>{resultSummary}</Text> : null}
            <PrBadgeRow badges={workout.prBadges} goalBadges={workout.goalBadges} />
          </View>
        ) : null}
        {caption && variant === "full" ? <Text numberOfLines={3} style={styles.caption}>{caption}</Text> : null}
        {workout.photoUrl && variant === "full" ? <WorkoutPhoto onError={() => console.warn("Authorized workout photo failed to render", { workoutId: workout.id, hasPhotoUrl: true })} uri={workout.photoUrl} variant="feed" /> : null}
        {socialSummary.length ? (
          <Text accessibilityLabel={socialSummary.map((item) => item.accessibility).join(", ")} numberOfLines={1} style={styles.reactionSummary}>
            {socialSummary.map((item) => item.text).join("   ")}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

export function CommunityFeed({
  anchorKey,
  edgeToEdge = false,
  mode = "full",
  onWorkoutPress,
  onWorkoutBlock,
  onWorkoutDelete,
  onWorkoutEdit,
  onWorkoutRemoveGoalBadge,
  onWorkoutRemovePrBadge,
  onWorkoutReport,
  showCommentCount = false,
  showReactionSummary = false,
  viewerUserId,
  viewportHeight,
  workouts,
}: {
  anchorKey?: string;
  edgeToEdge?: boolean;
  mode?: "preview" | "full";
  onWorkoutPress?: (workout: WorkoutFeedItem) => void;
  onWorkoutBlock?: (workout: WorkoutFeedItem) => void;
  onWorkoutDelete?: (workout: WorkoutFeedItem) => void;
  onWorkoutEdit?: (workout: WorkoutFeedItem) => void;
  onWorkoutRemoveGoalBadge?: (workout: WorkoutFeedItem) => void;
  onWorkoutRemovePrBadge?: (workout: WorkoutFeedItem) => void;
  onWorkoutReport?: (workout: WorkoutFeedItem) => void;
  showCommentCount?: boolean;
  showReactionSummary?: boolean;
  viewerUserId?: string | null;
  viewportHeight?: number;
  workouts: WorkoutFeedItem[];
}) {
  const insets = useSafeAreaInsets();
  const verticalBarEdge = useVerticalBarEdge();
  const feedBottomPadding = verticalBarEdge !== null ? insets.bottom + spacing.xxl : 132;
  const resolvedViewportHeight = viewportHeight ?? (mode === "preview" ? 320 : 340);
  const visibleWorkouts = mode === "preview" ? workouts.slice(0, 4) : workouts;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const setScrollRef = useCallback((node: ScrollViewInstance | null) => {
    scrollRef.current = node;
  }, []);
  const positions = useRef(new Map<string, { height: number; y: number }>());
  const contentHeight = useRef(0);
  const restored = useRef(false);
  const publishAnchor = useCallback((offsetY: number) => {
    if (!anchorKey || !restored.current) return;
    const items = [...positions.current.entries()].map(([id, layout]) => ({ height: layout.height, id, y: layout.y }));
    const next = topVisibleAnchor(items, offsetY);
    if (next) writeStoredScrollAnchor(anchorKey, next);
  }, [anchorKey]);
  const tryRestore = useCallback(() => {
    if (!anchorKey || restored.current) return;
    const saved = readStoredScrollAnchor(anchorKey);
    if (!saved) {
      restored.current = true;
      return;
    }
    const item = positions.current.get(saved.id);
    if (!item) {
      if (positions.current.size >= visibleWorkouts.length) restored.current = true;
      return;
    }
    scrollRef.current?.scrollTo({
      animated: false,
      y: anchoredScrollOffset(item, saved, contentHeight.current, resolvedViewportHeight),
    });
    restored.current = true;
  }, [anchorKey, resolvedViewportHeight, visibleWorkouts.length]);

  return (
    <View style={[styles.feedViewport, edgeToEdge && styles.edgeToEdgeFeedViewport, { height: resolvedViewportHeight }]}>
      <ScrollView
        {...keyboardScrollProps(Platform.OS)}
        contentContainerStyle={[styles.feedContent, { paddingBottom: feedBottomPadding }]}
        directionalLockEnabled
        nestedScrollEnabled
        onContentSizeChange={(_width, height) => {
          contentHeight.current = height;
          tryRestore();
        }}
        onScroll={(event) => {
          if (anchorKey) publishAnchor(event.nativeEvent.contentOffset.y);
        }}
        overScrollMode="never"
        ref={setScrollRef}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={mode === "full"}
        style={[styles.feedScroller, webFeedScrollerStyle]}
      >
        {visibleWorkouts.map((workout) => (
          <CommunityFeedItem
            key={workout.id}
            onItemFrame={(frame) => {
              positions.current.set(workout.id, frame);
              tryRestore();
            }}
            menuItems={workoutMenuItems({
              onBlock: onWorkoutBlock,
              onDelete: onWorkoutDelete,
              onEdit: onWorkoutEdit,
              onRemoveGoalBadge: onWorkoutRemoveGoalBadge,
              onRemovePrBadge: onWorkoutRemovePrBadge,
              onReport: onWorkoutReport,
              viewerUserId,
              workout,
            })}
            onPress={onWorkoutPress ? () => onWorkoutPress(workout) : undefined}
            showCommentCount={showCommentCount}
            showReactionSummary={showReactionSummary}
            viewerUserId={viewerUserId}
            workout={workout}
          />
        ))}
      </ScrollView>
      <LinearGradient
        colors={[
          colors.surfaceMuted,
          colors.feedFade,
          colors.boardTransparent,
        ]}
        locations={[0, 0.38, 1]}
        pointerEvents="none"
        style={[styles.edgeFade, styles.topFade]}
      />
      <LinearGradient
        colors={[
          colors.boardTransparent,
          colors.feedFadeSoft,
          colors.surfaceMuted,
        ]}
        locations={[0, 0.64, 1]}
        pointerEvents="none"
        style={[styles.edgeFade, styles.bottomFade]}
      />
    </View>
  );
}

function CommunityFeedItem({
  menuItems,
  onItemFrame,
  onPress,
  showCommentCount,
  showReactionSummary,
  viewerUserId,
  workout,
}: {
  menuItems?: ContentMenuItem[];
  onItemFrame?: (frame: { height: number; y: number }) => void;
  onPress?: () => void;
  showCommentCount: boolean;
  showReactionSummary: boolean;
  viewerUserId?: string | null;
  workout: WorkoutFeedItem;
}) {
  const isOwn = isOwnPost(workout.userId, viewerUserId);
  const title = workout.name?.trim() || workout.title;
  const summary = (
    <WorkoutSummaryCard
      isOwn={isOwn}
      menuItems={menuItems}
      showCommentCount={showCommentCount}
      showReactionSummary={showReactionSummary}
      variant="full"
      workout={workout}
    />
  );

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const { height, y } = event.nativeEvent.layout;
        onItemFrame?.({ height, y });
      }}
      style={styles.feedSlot}
    >
      {onPress ? (
        <Pressable
          accessibilityLabel={workoutFeedCardLabel({ title })}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => pressed && styles.workoutCardPressed}
        >
          {summary}
        </Pressable>
      ) : (
        summary
      )}
    </View>
  );
}

export function ContentOptionsMenu({
  accessibilityLabel,
  items,
}: {
  accessibilityLabel: string;
  items: ContentMenuItem[];
}) {
  const anchor = useRef<ViewInstance>(null);
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: spacing.md, top: 0 });
  const [visible, setVisible] = useState(false);
  const { onNativeDismiss } = useOverlayOccupancy(visible);
  const open = () => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      setPosition({
        left: Math.max(insets.left + spacing.md, Math.min(x + width - menuPopoverWidth, viewportWidth - insets.right - menuPopoverWidth - spacing.md)),
        top: Math.max(insets.top + spacing.xs, y + height + spacing.xs),
      });
      setVisible(true);
    });
  };
  const choose = (action: () => void) => {
    setVisible(false);
    action();
  };

  return (
    <>
      <View ref={anchor}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={(event) => { event.stopPropagation(); open(); }}
          style={(state) => [
            styles.postOptionsButton,
            state.pressed && styles.workoutCardPressed,
            webFocusRing(pressableFocused(state)),
          ]}
        >
          <Icon color={colors.muted} name="ellipsis" size={size.icon.md} />
        </Pressable>
      </View>
      <Modal animationType="fade" onDismiss={onNativeDismiss} onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <Pressable accessibilityLabel="Close post options" onPress={() => setVisible(false)} style={styles.postMenuBackdrop}>
          <Menu style={[styles.postMenu, position]}>
            {items.map((item) => (
              <MenuItem
                danger={item.danger}
                icon={item.icon}
                key={item.label}
                label={item.label}
                onPress={() => choose(item.onPress)}
              />
            ))}
          </Menu>
        </Pressable>
      </Modal>
    </>
  );
}

export function formatWorkoutType(value: string) {
  const fallback = value.split("_").filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
  return (value in workoutTypeLabels
    ? workoutTypeLabels[value as keyof typeof workoutTypeLabels]
    : undefined) ?? (fallback || "Workout");
}

function normalizeLabel(value: string) {
  return value.trim().replace(/[_\s]+/g, " ").toLowerCase();
}

const styles = StyleSheet.create({
  brandHeader: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  brandHeaderMark: { height: 29, width: 36 },
  lockup: { height: 29, width: 88 },
  wordmark: { fontFamily: fonts.display },
  safeArea: { backgroundColor: colors.background, flex: 1, overflow: "hidden" },
  screenScroll: { flexGrow: 1, paddingHorizontal: spacing.md },
  screenBleed: { marginHorizontal: -spacing.md },
  sideInset: { flexGrow: 1 },
  screenContent: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  transformedScreenContent: { overflow: "visible", paddingBottom: 96 },
  overflowVisible: { overflow: "visible" },
  button: { alignItems: "center", borderRadius: radii.md, justifyContent: "center", paddingHorizontal: spacing.lg },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  buttonText: { ...type.button, flexShrink: 1, textAlign: "center" },
  buttonHelper: { color: colors.disabledText, marginTop: controlHelperGap, ...type.bodySmall },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, boxShadow: elevation.e1, padding: spacing.lg },
  cardSelected: { boxShadow: `${elevation.e1}, inset 0 0 0 2px ${colors.brand}` },
  sectionHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  sectionCopy: { flex: 1 },
  eyebrow: { color: colors.brand, ...type.eyebrow, marginBottom: spacing.xs },
  sectionTitle: { color: colors.ink, ...type.title },
  stateCard: { alignSelf: "stretch", gap: spacing.sm },
  stateIcon: { alignItems: "center", height: stateIconSize, justifyContent: "center", width: stateIconSize },
  stateTitle: { color: colors.ink, ...type.heading },
  bodyMuted: { color: colors.muted, ...type.bodySmall },
  stateAction: { alignSelf: "flex-start", height: stateActionHeight, marginTop: spacing.sm, minHeight: stateActionHeight },
  // eslint-disable-next-line repin/no-style-literals -- empty-state floor so the spinner can center; not a control size
  loadingState: { flex: 1, justifyContent: "center", minHeight: 300 },
  workoutTopline: { alignItems: "center", flexDirection: "row" },
  compactWorkoutCard: { padding: spacing.lg },
  fullWorkoutCard: { padding: spacing.lg },
  avatar: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: 38, justifyContent: "center", width: 38 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: type.label.fontSize },
  workoutAuthor: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  authorNameRow: ownPostAuthorNameRowStyle(),
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.bodySmall.fontSize, ...ownPostAuthorNameStyle() },
  timestamp: { color: colors.muted, fontFamily: fonts.regular, fontSize: type.label.fontSize, marginTop: 2 },
  typePill: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexShrink: 0, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.micro.fontSize },
  postOptionsButton: { alignItems: "center", height: size.hit, justifyContent: "center", marginLeft: spacing.xs, width: size.hit },
  postMenuBackdrop: { flex: 1 },
  postMenu: { position: "absolute", width: menuPopoverWidth },
  workoutTitle: { color: colors.ink, ...type.cardTitle, marginTop: spacing.lg },
  compactWorkoutTitle: { marginTop: spacing.md },
  workoutMetadata: { color: colors.muted, fontFamily: fonts.medium, fontSize: type.label.fontSize, lineHeight: type.label.lineHeight, marginTop: spacing.xs },
  resultRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  workoutResultSummary: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight },
  reactionSummary: { alignSelf: "flex-end", color: colors.muted, fontFamily: fonts.medium, fontSize: type.label.fontSize, lineHeight: type.label.lineHeight, marginTop: spacing.sm },
  workoutCardPressed: { opacity: 0.94 },
  caption: { color: colors.inkSoft, ...type.bodySmall, marginTop: spacing.md },
  workoutCardWrap: communityFeedCardLayout(),
  feedViewport: {
    alignSelf: "stretch",
    borderRadius: radii.md,
    marginHorizontal: -spacing.md,
    overflow: "hidden",
  },
  // eslint-disable-next-line repin/no-style-literals -- square edge for the edge-to-edge feed; spec §2.3 keeps borderRadius 0
  edgeToEdgeFeedViewport: { backgroundColor: colors.surfaceMuted, borderRadius: 0 },
  feedScroller: { overflow: "visible" },
  // 12pt bleed plus the board's 16pt inset. Cards fill the remaining column.
  feedContent: { paddingHorizontal: spacing.md + spacing.lg, paddingTop: spacing.xxl },
  feedSlot: { minWidth: 0, paddingBottom: spacing.md, paddingTop: spacing.sm, width: "100%" },
  edgeFade: { height: 20, left: 0, position: "absolute", right: 0, zIndex: 10 },
  topFade: { top: 0 },
  bottomFade: { bottom: 0 },
});
