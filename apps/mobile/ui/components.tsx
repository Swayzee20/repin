import { getUserInitials, resolveUserDisplayName, type WorkoutFeedItem } from "@repin/types";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import type { StyleProp, TextInputProps, ViewInstance, ViewProps, ViewStyle } from "react-native";
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
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { useVerticalBarEdge } from "./vertical-bar-edge";
import { anchoredScrollOffset, topVisibleAnchor } from "./layout-math";
import { readStoredScrollAnchor, writeStoredScrollAnchor } from "./scroll-anchor";

import repinLockup from "../assets/branding/repin-lockup.png";
import repinLockupReversed from "../assets/branding/repin-lockup-reversed.png";
import repinMark from "../assets/branding/repin-mark.png";
import { formatWorkoutDate } from "../lib/workout-date";
import { WideColumn } from "./layout";
import { pressableFocused, webFocusRing } from "./focus-ring";
import {
  buttonAppearance,
  buttonShowsDisabledReason,
  controlHelperGap,
  type ButtonVariant,
} from "./primitive-state";
import { colors, controls, elevation, fonts, radii, spacing, type } from "./theme";
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
  size = 22,
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
        contentContainerStyle={styles.screenScroll}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
  loading = false,
  loadingLabel,
  onPress,
  variant = "primary",
  style,
}: {
  children: string;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  loadingLabel?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  style?: ViewStyle;
}) {
  const showHelper = buttonShowsDisabledReason(disabled, loading, disabledReason);
  const resting = buttonAppearance({ disabled, loading, pressed: false, variant });
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
              color={resting.color}
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <Text style={[styles.buttonText, { color: resting.color }]}>{label}</Text>
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

export function TextField({
  compact = false,
  containerStyle,
  focusedStyle,
  label,
  hint,
  onBlur,
  onFocus,
  ref,
  style,
  ...props
}: TextInputProps & {
  compact?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  focusedStyle?: TextInputProps["style"];
  label?: string;
  hint?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, compact && styles.fieldCompact, containerStyle]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        ref={ref}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={colors.subtle}
        selectionColor={colors.brand}
        style={[
          styles.input,
          compact && styles.inputCompact,
          focused && styles.inputFocused,
          props.multiline && styles.multiline,
          style,
          focused && focusedStyle,
        ]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

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
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.bodyMuted}>{message}</Text>
      {actionLabel && onAction ? <Button onPress={onAction} style={styles.stateAction}>{actionLabel}</Button> : null}
    </Card>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={styles.bodyMuted}>{message}</Text>
    </View>
  );
}

export function WorkoutCard({
  focalY,
  layoutY,
  onPress,
  onDelete,
  onEdit,
  scrollY,
  showReactionSummary = false,
  showCommentCount = false,
  side = "left",
  viewportHeight,
  workout,
}: {
  focalY: number;
  layoutY: SharedValue<number>;
  onPress?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  scrollY: SharedValue<number>;
  showReactionSummary?: boolean;
  showCommentCount?: boolean;
  side?: "left" | "right";
  viewportHeight: number;
  workout: WorkoutFeedItem;
}) {
  const cardHeight = useSharedValue(160);
  const reduceMotion = useReducedMotion();
  const direction = side === "left" ? 1 : -1;
  const animatedStyle = useAnimatedStyle(() => {
    const cardCenter = layoutY.value - scrollY.value + cardHeight.value / 2;
    const focusDelta = cardCenter - focalY;
    const focusPlateau = 22;
    const distanceBeyondFocus = Math.max(0, Math.abs(focusDelta) - focusPlateau);
    const proximity = interpolate(
      distanceBeyondFocus,
      [0, 300 - focusPlateau],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const scale = reduceMotion ? 1 : interpolate(proximity, [0, 1], [0.9, 1.03]);
    const angleFactor = reduceMotion ? 1 : interpolate(proximity, [0, 1], [1, 0.34]);
    const translateX = reduceMotion
      ? 0
      : interpolate(proximity, [0, 1], [-direction * 18, 0]);
    const opacity = reduceMotion
      ? 1
      : interpolate(
          focusDelta,
          [-focalY, -focusPlateau, focusPlateau, viewportHeight - focalY],
          [0.8, 1, 1, 0.84],
          Extrapolation.CLAMP,
        );

    return {
      opacity,
      transform: [
        { perspective: 900 },
        { translateX },
        { scale },
        { rotateY: `${direction * 2.2 * angleFactor}deg` },
        { rotateZ: `${direction * -0.35 * angleFactor}deg` },
      ],
    };
  });

  return (
    <Animated.View
      onLayout={(event) => {
        cardHeight.value = event.nativeEvent.layout.height;
      }}
      style={[styles.feedCardShell, side === "left" ? styles.floatingLeft : styles.floatingRight, animatedStyle]}
    >
      {onPress ? (
        <Pressable
          accessibilityLabel={`Open ${workout.title} workout details`}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => pressed && styles.workoutCardPressed}
        >
          <WorkoutSummaryCard onDelete={onDelete} onEdit={onEdit} showCommentCount={showCommentCount} showReactionSummary={showReactionSummary} style={styles.feedCardFlat} variant="full" workout={workout} />
        </Pressable>
      ) : (
        <WorkoutSummaryCard onDelete={onDelete} onEdit={onEdit} showCommentCount={showCommentCount} showReactionSummary={showReactionSummary} style={styles.feedCardFlat} variant="full" workout={workout} />
      )}
    </Animated.View>
  );
}

export function WorkoutSummaryCard({
  onDelete,
  onEdit,
  selected = false,
  showCommentCount = false,
  showReactionSummary = false,
  style,
  variant = "full",
  workout,
}: {
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
  const socialSummary = [
    ...(reactionSummary.length
      ? [{ accessibility: `${reactionTotal} reaction${reactionTotal === 1 ? "" : "s"}`, text: reactionSummary.map(([emoji, value]) => `${emoji} ${value}`).join("   ") }]
      : []),
    ...(showCommentCount && (workout.commentCount ?? 0) > 0
      ? [{ accessibility: `${workout.commentCount} comment${workout.commentCount === 1 ? "" : "s"}`, text: `💬 ${workout.commentCount}` }]
      : []),
  ];

  return (
    <Card selected={selected} style={[variant === "compact" ? styles.compactWorkoutCard : styles.fullWorkoutCard, style]}>
      <View style={styles.workoutTopline}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{getUserInitials({ displayName: workout.displayName })}</Text></View>
        <View style={styles.workoutAuthor}>
          <Text numberOfLines={1} style={styles.author}>{displayName}</Text>
          <Text style={styles.timestamp}>{formatWorkoutDate(workout)}</Text>
        </View>
        {showTypeChip ? <View style={styles.typePill}><Text style={styles.typeText}>{typeLabel}</Text></View> : null}
        {onEdit && onDelete ? <PostOptionsMenu onDelete={onDelete} onEdit={onEdit} /> : null}
      </View>
      <Text numberOfLines={variant === "compact" ? 1 : 2} style={[styles.workoutTitle, variant === "compact" && styles.compactWorkoutTitle]}>{title}</Text>
      {duration || effort ? <Text numberOfLines={1} style={styles.workoutMetadata}>{[duration, effort].filter(Boolean).join("  ·  ")}</Text> : null}
      {resultSummary ? <Text numberOfLines={1} style={styles.workoutResultSummary}>{resultSummary}</Text> : null}
      {caption && variant === "full" ? <Text numberOfLines={3} style={styles.caption}>{caption}</Text> : null}
      {workout.photoUrl && variant === "full" ? <WorkoutPhoto onError={() => console.warn("Authorized workout photo failed to render", { workoutId: workout.id, hasPhotoUrl: true })} uri={workout.photoUrl} variant="feed" /> : null}
      {socialSummary.length ? (
        <Text accessibilityLabel={socialSummary.map((item) => item.accessibility).join(", ")} numberOfLines={1} style={styles.reactionSummary}>
          {socialSummary.map((item) => item.text).join("   ")}
        </Text>
      ) : null}
    </Card>
  );
}

export function CommunityFeed({
  anchorKey,
  edgeToEdge = false,
  focusOffsetY = 0,
  mode = "full",
  onWorkoutPress,
  onWorkoutDelete,
  onWorkoutEdit,
  showCommentCount = false,
  showReactionSummary = false,
  viewerUserId,
  viewportHeight,
  workouts,
}: {
  anchorKey?: string;
  edgeToEdge?: boolean;
  focusOffsetY?: number;
  mode?: "preview" | "full";
  onWorkoutPress?: (workout: WorkoutFeedItem) => void;
  onWorkoutDelete?: (workout: WorkoutFeedItem) => void;
  onWorkoutEdit?: (workout: WorkoutFeedItem) => void;
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
  const scrollY = useSharedValue(0);
  const itemHeights = useSharedValue<Record<string, number>>({});
  const orderedWorkoutIds = visibleWorkouts.map((workout) => workout.id);
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
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (anchorKey) runOnJS(publishAnchor)(event.contentOffset.y);
    },
  }, [anchorKey, publishAnchor]);

  return (
    <View style={[styles.feedViewport, edgeToEdge && styles.edgeToEdgeFeedViewport, { height: resolvedViewportHeight }]}>
      <Animated.ScrollView
        contentContainerStyle={[styles.feedContent, { paddingBottom: feedBottomPadding }]}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onContentSizeChange={(_width, height) => {
          contentHeight.current = height;
          tryRestore();
        }}
        onScroll={scrollHandler}
        overScrollMode="never"
        ref={setScrollRef}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={mode === "full"}
        style={[styles.feedScroller, webFeedScrollerStyle]}
      >
        {visibleWorkouts.map((workout, index) => (
          <CommunityFeedItem
            focalY={resolvedViewportHeight * 0.38 - focusOffsetY}
            itemHeights={itemHeights}
            key={workout.id}
            onItemFrame={(frame) => {
              positions.current.set(workout.id, frame);
              tryRestore();
            }}
            onPress={onWorkoutPress ? () => onWorkoutPress(workout) : undefined}
            onDelete={viewerUserId === workout.userId && onWorkoutDelete ? () => onWorkoutDelete(workout) : undefined}
            onEdit={viewerUserId === workout.userId && onWorkoutEdit ? () => onWorkoutEdit(workout) : undefined}
            orderedWorkoutIds={orderedWorkoutIds}
            scrollY={scrollY}
            showCommentCount={showCommentCount}
            showReactionSummary={showReactionSummary}
            side={index % 2 === 0 ? "left" : "right"}
            viewportHeight={resolvedViewportHeight}
            workout={workout}
          />
        ))}
      </Animated.ScrollView>
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
  focalY,
  itemHeights,
  onItemFrame,
  onPress,
  onDelete,
  onEdit,
  orderedWorkoutIds,
  scrollY,
  showCommentCount,
  showReactionSummary,
  side,
  viewportHeight,
  workout,
}: {
  focalY: number;
  itemHeights: SharedValue<Record<string, number>>;
  onItemFrame?: (frame: { height: number; y: number }) => void;
  onPress?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  orderedWorkoutIds: string[];
  scrollY: SharedValue<number>;
  showCommentCount: boolean;
  showReactionSummary: boolean;
  side: "left" | "right";
  viewportHeight: number;
  workout: WorkoutFeedItem;
}) {
  const measuredLayoutY = useSharedValue(0);
  const workoutIndex = orderedWorkoutIds.indexOf(workout.id);
  const layoutY = useDerivedValue(() => {
    let cumulativeY = spacing.xxl;

    for (let index = 0; index < workoutIndex; index += 1) {
      const precedingId = orderedWorkoutIds[index];
      if (!precedingId) return measuredLayoutY.value;
      const precedingHeight = itemHeights.value[precedingId];
      if (precedingHeight === undefined) return measuredLayoutY.value;
      cumulativeY += precedingHeight;
    }

    return cumulativeY;
  });

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const { height, y } = event.nativeEvent.layout;
        measuredLayoutY.value = y;
        onItemFrame?.({ height, y });
        if (itemHeights.value[workout.id] !== height) {
          itemHeights.value = { ...itemHeights.value, [workout.id]: height };
        }
      }}
      renderToHardwareTextureAndroid
      style={styles.feedSlot}
    >
      <WorkoutCard
        focalY={focalY}
        layoutY={layoutY}
        onPress={onPress}
        onDelete={onDelete}
        onEdit={onEdit}
        scrollY={scrollY}
        showCommentCount={showCommentCount}
        showReactionSummary={showReactionSummary}
        side={side}
        viewportHeight={viewportHeight}
        workout={workout}
      />
    </View>
  );
}

function PostOptionsMenu({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  const anchor = useRef<ViewInstance>(null);
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: spacing.md, top: 0 });
  const [visible, setVisible] = useState(false);
  const open = () => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      setPosition({
        left: Math.max(insets.left + spacing.md, Math.min(x + width - 176, viewportWidth - insets.right - 176 - spacing.md)),
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
          accessibilityLabel="Post options"
          accessibilityRole="button"
          hitSlop={8}
          onPress={(event) => { event.stopPropagation(); open(); }}
          style={({ pressed }) => [styles.postOptionsButton, pressed && styles.workoutCardPressed]}
        >
          <Feather color={colors.muted} name="more-horizontal" size={19} />
        </Pressable>
      </View>
      <Modal animationType="fade" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <Pressable accessibilityLabel="Close post options" onPress={() => setVisible(false)} style={styles.postMenuBackdrop}>
          <View style={[styles.postMenu, position]}>
            <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); choose(onEdit); }} style={styles.postMenuRow}>
              <Feather color={colors.inkSoft} name="edit-2" size={16} />
              <Text style={styles.postMenuText}>Edit</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); choose(onDelete); }} style={styles.postMenuRow}>
              <Feather color={colors.danger} name="trash-2" size={16} />
              <Text style={styles.postMenuDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const workoutTypeLabels: Record<string, string> = {
  run: "Run",
  walk: "Walk",
  strength_training: "Strength Training",
  powerlifting: "Powerlifting",
  hiit: "HIIT",
  functional_fitness: "Functional Fitness",
  other: "Other",
};

export function formatWorkoutType(value: string) {
  const fallback = value.split("_").filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
  return workoutTypeLabels[value] ?? (fallback || "Workout");
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
  field: { gap: spacing.sm },
  fieldCompact: { gap: spacing.xs },
  fieldLabel: { color: colors.inkSoft, ...type.label },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 16, minHeight: controls.inputHeight, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  inputCompact: { minHeight: 48, paddingVertical: spacing.sm },
  inputFocused: { borderColor: colors.brand },
  multiline: { minHeight: 108, textAlignVertical: "top" },
  hint: { color: colors.muted, ...type.bodySmall },
  sectionHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  sectionCopy: { flex: 1 },
  eyebrow: { color: colors.brand, ...type.eyebrow, marginBottom: spacing.xs },
  sectionTitle: { color: colors.ink, ...type.title },
  stateCard: { gap: spacing.sm },
  stateTitle: { color: colors.ink, ...type.heading },
  bodyMuted: { color: colors.muted, ...type.bodySmall },
  stateAction: { alignSelf: "flex-start", marginTop: spacing.sm },
  loadingState: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", minHeight: 300 },
  workoutTopline: { alignItems: "center", flexDirection: "row" },
  compactWorkoutCard: { padding: spacing.lg },
  fullWorkoutCard: { padding: spacing.lg },
  avatar: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: 38, justifyContent: "center", width: 38 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 12 },
  workoutAuthor: { flex: 1, marginLeft: spacing.md },
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15 },
  timestamp: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  typePill: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 11 },
  postOptionsButton: { alignItems: "center", height: 36, justifyContent: "center", marginLeft: spacing.xs, width: 36 },
  postMenuBackdrop: { flex: 1 },
  postMenu: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, boxShadow: elevation.e2, padding: spacing.xs, position: "absolute", width: 176 },
  postMenuRow: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  postMenuText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  postMenuDeleteText: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 15 },
  workoutTitle: { color: colors.ink, ...type.cardTitle, marginTop: spacing.lg },
  compactWorkoutTitle: { marginTop: spacing.md },
  workoutMetadata: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  workoutResultSummary: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, marginTop: spacing.xs },
  reactionSummary: { alignSelf: "flex-end", color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  workoutCardPressed: { opacity: 0.94 },
  caption: { color: colors.inkSoft, ...type.bodySmall, marginTop: spacing.md },
  feedCardShell: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    boxShadow: elevation.e1,
    width: "94%",
  },
  feedCardFlat: { boxShadow: "none" },
  floatingLeft: {
    alignSelf: "flex-start",
  },
  floatingRight: {
    alignSelf: "flex-end",
  },
  feedViewport: {
    alignSelf: "stretch",
    borderRadius: radii.md,
    marginHorizontal: -spacing.md,
    overflow: "hidden",
  },
  edgeToEdgeFeedViewport: { backgroundColor: colors.surfaceMuted, borderRadius: 0 },
  feedScroller: { overflow: "visible" },
  // 12pt bleed plus the feed's previous 16pt inset, so staggered cards stay put.
  feedContent: { paddingHorizontal: spacing.md + spacing.lg, paddingTop: spacing.xxl },
  feedSlot: { minWidth: 0, overflow: "visible", paddingBottom: spacing.md, paddingTop: spacing.sm, width: "100%" },
  edgeFade: { height: 20, left: 0, position: "absolute", right: 0, zIndex: 10 },
  topFade: { top: 0 },
  bottomFade: { bottom: 0 },
});
