import { getUserInitials, resolveUserDisplayName, type WorkoutFeedItem } from "@repin/types";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState, type ReactNode } from "react";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import repinHeaderMark from "../assets/branding/repin-header-mark.png";
import { formatWorkoutDate } from "../lib/workout-date";
import { colors, controls, fonts, radii, spacing, type } from "./theme";
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

export function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <Image
        accessible={false}
        resizeMode="contain"
        source={repinHeaderMark}
        style={styles.brandHeaderMark}
      />
      <Text style={styles.brandHeaderText}>REPIN</Text>
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.screenContent,
          preserveTransformedContent && styles.transformedScreenContent,
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        removeClippedSubviews={false}
        style={preserveTransformedContent ? styles.overflowVisible : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BackButton({ label = "Back", onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.backButton}>
      <Text style={styles.backText}>‹ {label}</Text>
    </Pressable>
  );
}

export function Button({
  children,
  disabled,
  loading,
  onPress,
  variant = "primary",
  style,
}: {
  children: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.primaryButton : variant === "secondary" ? styles.secondaryButton : styles.quietButton,
        pressed && !isDisabled && styles.pressed,
        pressed && !isDisabled && variant === "primary" && styles.primaryButtonPressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.surface : colors.brand} />
      ) : (
        <Text style={variant === "primary" ? styles.primaryButtonText : styles.secondaryButtonText}>{children}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function TextField({
  compact = false,
  containerStyle,
  label,
  hint,
  onBlur,
  onFocus,
  style,
  ...props
}: TextInputProps & {
  compact?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  label?: string;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, compact && styles.fieldCompact, containerStyle]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
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
      elevation: reduceMotion ? 2 : interpolate(proximity, [0, 1], [1.5, 3.5]),
      opacity,
      shadowOffset: {
        height: reduceMotion ? 5 : interpolate(proximity, [0, 1], [4, 10]),
        width: 0,
      },
      shadowOpacity: reduceMotion ? 0.055 : interpolate(proximity, [0, 1], [0.045, 0.065]),
      shadowRadius: reduceMotion ? 17 : interpolate(proximity, [0, 1], [15, 25]),
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
      style={[styles.floatingWorkout, side === "left" ? styles.floatingLeft : styles.floatingRight, animatedStyle]}
    >
      {onPress ? (
        <Pressable
          accessibilityLabel={`Open ${workout.title} workout details`}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => pressed && styles.workoutCardPressed}
        >
          <WorkoutSummaryCard onDelete={onDelete} onEdit={onEdit} showCommentCount={showCommentCount} showReactionSummary={showReactionSummary} variant="full" workout={workout} />
        </Pressable>
      ) : (
        <WorkoutSummaryCard onDelete={onDelete} onEdit={onEdit} showCommentCount={showCommentCount} showReactionSummary={showReactionSummary} variant="full" workout={workout} />
      )}
    </Animated.View>
  );
}

export function WorkoutSummaryCard({
  onDelete,
  onEdit,
  showCommentCount = false,
  showReactionSummary = false,
  style,
  variant = "full",
  workout,
}: {
  onDelete?: () => void;
  onEdit?: () => void;
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
    <Card style={[variant === "compact" ? styles.compactWorkoutCard : styles.fullWorkoutCard, style]}>
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
  const resolvedViewportHeight = viewportHeight ?? (mode === "preview" ? 320 : 340);
  const visibleWorkouts = mode === "preview" ? workouts.slice(0, 4) : workouts;
  const scrollY = useSharedValue(0);
  const itemHeights = useSharedValue<Record<string, number>>({});
  const orderedWorkoutIds = visibleWorkouts.map((workout) => workout.id);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });

  return (
    <View style={[styles.feedViewport, edgeToEdge && styles.edgeToEdgeFeedViewport, { height: resolvedViewportHeight }]}>
      <Animated.ScrollView
        contentContainerStyle={styles.feedContent}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onScroll={scrollHandler}
        overScrollMode="never"
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
          "#F7F2F2",
          "rgba(247,242,242,0.58)",
          "rgba(247,242,242,0)",
        ]}
        locations={[0, 0.38, 1]}
        pointerEvents="none"
        style={[styles.edgeFade, styles.topFade]}
      />
      <LinearGradient
        colors={[
          "rgba(247,242,242,0)",
          "rgba(247,242,242,0.54)",
          "#F7F2F2",
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
  const anchor = useRef<View>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: spacing.md, top: 0 });
  const [visible, setVisible] = useState(false);
  const open = () => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      setPosition({ left: Math.max(spacing.md, Math.min(x + width - 176, viewportWidth - 176 - spacing.md)), top: y + height + spacing.xs });
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
  brandHeaderMark: { height: 16, width: 27 },
  brandHeaderText: { color: colors.brand, ...type.eyebrow },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  screenContent: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 72 },
  transformedScreenContent: { overflow: "visible", paddingBottom: 96 },
  overflowVisible: { overflow: "visible" },
  backButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginBottom: spacing.xl },
  backText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 15 },
  button: { alignItems: "center", borderRadius: radii.md, justifyContent: "center", minHeight: controls.buttonHeight, paddingHorizontal: spacing.lg },
  primaryButton: { backgroundColor: colors.brand },
  primaryButtonPressed: { backgroundColor: colors.brandPressed },
  secondaryButton: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 1 },
  quietButton: { backgroundColor: "transparent" },
  primaryButtonText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 16 },
  secondaryButtonText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg },
  field: { gap: spacing.sm },
  fieldCompact: { gap: spacing.xs },
  fieldLabel: { color: colors.inkSoft, ...type.label },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radii.input, borderWidth: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 16, minHeight: controls.inputHeight, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
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
  avatar: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.pill, height: 38, justifyContent: "center", width: 38 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 12 },
  workoutAuthor: { flex: 1, marginLeft: spacing.md },
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15 },
  timestamp: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  typePill: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 11 },
  postOptionsButton: { alignItems: "center", height: 36, justifyContent: "center", marginLeft: spacing.xs, width: 36 },
  postMenuBackdrop: { flex: 1 },
  postMenu: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, elevation: 5, padding: spacing.xs, position: "absolute", shadowColor: colors.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.1, shadowRadius: 10, width: 176 },
  postMenuRow: { alignItems: "center", borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  postMenuText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  postMenuDeleteText: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 15 },
  workoutTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, marginTop: spacing.lg },
  compactWorkoutTitle: { marginTop: spacing.md },
  workoutMetadata: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  workoutResultSummary: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, marginTop: spacing.xs },
  reactionSummary: { alignSelf: "flex-end", color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  workoutCardPressed: { opacity: 0.94 },
  caption: { color: colors.inkSoft, ...type.bodySmall, marginTop: spacing.md },
  floatingWorkout: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    elevation: 2,
    shadowColor: "#101318",
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.055,
    shadowRadius: 17,
    width: "94%",
  },
  floatingLeft: {
    alignSelf: "flex-start",
  },
  floatingRight: {
    alignSelf: "flex-end",
  },
  feedViewport: {
    borderRadius: radii.md,
    overflow: "hidden",
    width: "100%",
  },
  edgeToEdgeFeedViewport: { backgroundColor: "#F7F2F2", borderRadius: 0 },
  feedScroller: { overflow: "visible" },
  feedContent: { paddingBottom: 132, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  feedSlot: { minWidth: 0, overflow: "visible", paddingBottom: spacing.md, paddingTop: spacing.sm, width: "100%" },
  edgeFade: { height: 20, left: 0, position: "absolute", right: 0, zIndex: 10 },
  topFade: { top: 0 },
  bottomFade: { bottom: 0 },
});
