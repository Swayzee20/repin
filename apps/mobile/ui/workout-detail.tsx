import {
  communityReactionTypes,
  formatGroupedIntervalSegment,
  getUserInitials,
  groupConsecutiveIntervalSegments,
  resolveUserDisplayName,
  type CommunityReactionSummary,
  type CommunityReactionType,
  type CommunityPostComment,
  type CommunityWorkoutDetail,
  type WorkoutFeedItem,
} from "@repin/types";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCommentDraft } from "../lib/comment-draft";
import { supabase } from "../lib/supabase";
import {
  formatWorkoutMetric,
  formatWorkoutSet,
} from "../lib/workout-detail-format";
import { formatWorkoutDate } from "../lib/workout-date";
import {
  dedupeWorkoutCommentsRequest,
  dedupeWorkoutDetailRequest,
  readCachedWorkoutReactions,
  readWorkoutCommentsCache,
  readWorkoutDetailCache,
  updateCachedWorkoutReactions,
  writeWorkoutCommentsCache,
  writeWorkoutDetailCache,
} from "../lib/workout-detail-cache";
import {
  Card,
  formatWorkoutType,
  LoadingState,
  StateCard,
} from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron } from "./icons";
import { TwoPane, useLayoutMode, WideColumn } from "./layout";
import { colors, fonts, radii, size, spacing, type } from "./theme";
import { PhotoViewer } from "./photo-viewer";
import { ScrollAnchor, ScrollAnchorProvider, useScrollAnchor } from "./scroll-anchor";
import { WorkoutPhoto } from "./workout-photo";

const webScrollerStyle = Platform.OS === "web"
  ? ({
      WebkitOverflowScrolling: "touch",
      overflowY: "auto",
      overscrollBehaviorY: "contain",
      touchAction: "pan-y",
    } as ViewStyle)
  : undefined;

const commentFieldMaxHeight = size.hit * 2 + spacing.xxxl;

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";

let focusedComposerSession: string | null = null;
let ignoreComposerBlur = false;
let composerBlurTimer: ReturnType<typeof setTimeout> | null = null;

export function holdComposerFocus() {
  ignoreComposerBlur = true;
  if (composerBlurTimer) {
    clearTimeout(composerBlurTimer);
    composerBlurTimer = null;
  }
}

export function releaseComposerFocus() {
  ignoreComposerBlur = false;
}

function markComposerFocused(sessionId: string) {
  focusedComposerSession = sessionId;
}

function markComposerBlurred(sessionId: string) {
  if (ignoreComposerBlur) return;
  if (focusedComposerSession === sessionId) focusedComposerSession = null;
}

export type WorkoutDetailFixture = {
  comments: CommunityPostComment[];
  workout: CommunityWorkoutDetail;
};

export function WorkoutDetailView({
  detailExpansionResetKey,
  detailPhotoMaxHeight,
  fixture = null,
  groupId,
  leading = null,
  onCommentCountChange,
  onReactionSummaryChange,
  paneHeader = null,
  presentation = "default",
  refreshOnFocus = false,
  seedWorkout,
  sessionId,
}: {
  detailExpansionResetKey?: string;
  detailPhotoMaxHeight?: number;
  fixture?: WorkoutDetailFixture | null;
  groupId: string;
  leading?: ReactNode;
  onCommentCountChange?: (sessionId: string, commentCount: number) => void;
  onReactionSummaryChange?: (sessionId: string, reactions: CommunityReactionSummary) => void;
  paneHeader?: ReactNode;
  presentation?: "community-modal" | "community-pane" | "default" | "session";
  refreshOnFocus?: boolean;
  seedWorkout?: WorkoutFeedItem;
  sessionId: string;
}) {
  const initialDetail = useRef<{
    fresh: boolean;
    workout: CommunityWorkoutDetail | null;
  } | null>(null);
  if (!initialDetail.current) {
    const cached = readWorkoutDetailCache(groupId, sessionId);
    initialDetail.current = {
      fresh: cached?.fresh ?? false,
      workout: cached?.data ?? (seedWorkout
        ? createSeedWorkoutDetail(
            seedWorkout,
            readCachedWorkoutReactions(groupId, sessionId),
          )
        : null),
    };
  }
  const initialComments = useRef<{
    comments: CommunityPostComment[];
    fresh: boolean;
  } | null>(null);
  if (!initialComments.current) {
    const cached = readWorkoutCommentsCache(groupId, sessionId);
    initialComments.current = {
      comments: cached?.data ?? [],
      fresh: cached?.fresh ?? false,
    };
  }

  const [workout, setWorkout] = useState<CommunityWorkoutDetail | null>(
    fixture?.workout ?? initialDetail.current.workout,
  );
  const [loading, setLoading] = useState(fixture ? false : !initialDetail.current.fresh);
  const [error, setError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionPending, setReactionPending] = useState(false);
  const [comments, setComments] = useState<CommunityPostComment[]>(
    fixture?.comments ?? initialComments.current.comments,
  );
  const [commentsLoading, setCommentsLoading] = useState(
    fixture ? false : !initialComments.current.fresh,
  );
  const [commentError, setCommentError] = useState<string | null>(null);
  const { clearDraft, draft: commentText, setDraft: setCommentText } = useCommentDraft(sessionId);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const detailAnchor = useScrollAnchor(
    sessionId,
    presentation === "default" ? null : `workout-detail:${sessionId}`,
  );
  const insets = useSafeAreaInsets();
  const { mode } = useLayoutMode();
  const reactionRequestPending = useRef(false);
  const commentRequestPending = useRef(false);
  const mounted = useRef(true);
  const workoutRef = useRef(workout);
  const reactionsWereChanged = useRef(false);
  const latestReactions = useRef(
    workout?.reactions ?? emptyCommunityReactionSummary(),
  );

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const loadWorkout = useCallback(async (force = false) => {
    const cached = readWorkoutDetailCache(groupId, sessionId);
    if (!force && cached?.fresh) {
      workoutRef.current = cached.data;
      latestReactions.current = cached.data.reactions;
      setWorkout(cached.data);
      setLoading(false);
      onReactionSummaryChange?.(sessionId, cached.data.reactions);
      return;
    }

    if (!workoutRef.current) setLoading(true);
    setError(null);
    try {
      const loadedWorkout = await dedupeWorkoutDetailRequest(
        groupId,
        sessionId,
        async () => {
          if (!supabase) throw new Error("Supabase is not configured.");
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !data.session) throw new Error("Sign in to view this workout.");

          const response = await fetch(
            `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}`,
            {
              headers: { Authorization: `Bearer ${data.session.access_token}` },
              signal: AbortSignal.timeout(7_500),
            },
          );
          const body = (await response.json()) as {
            error?: string;
            workout?: CommunityWorkoutDetail;
          };
          if (!response.ok || !body.workout) {
            if (response.status === 404) {
              throw new Error("This workout is not available in your community.");
            }
            throw new Error(body.error ?? "Workout details could not be loaded.");
          }
          return {
            ...body.workout,
            reactions: body.workout.reactions ?? emptyCommunityReactionSummary(),
          };
        },
      );
      const nextWorkout = reactionsWereChanged.current
        ? { ...loadedWorkout, reactions: latestReactions.current }
        : loadedWorkout;
      writeWorkoutDetailCache(groupId, sessionId, nextWorkout);
      if (!mounted.current) return;
      workoutRef.current = nextWorkout;
      latestReactions.current = nextWorkout.reactions;
      setWorkout(nextWorkout);
      onReactionSummaryChange?.(sessionId, nextWorkout.reactions);
    } catch (loadError) {
      if (!mounted.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Workout details could not be loaded.",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [groupId, onReactionSummaryChange, sessionId]);

  const loadComments = useCallback(async (force = false) => {
    const cached = readWorkoutCommentsCache(groupId, sessionId);
    if (!force && cached?.fresh) {
      setComments(cached.data);
      setCommentsLoading(false);
      onCommentCountChange?.(sessionId, cached.data.length);
      return;
    }

    setCommentsLoading(true);
    setCommentError(null);
    try {
      const loadedComments = await dedupeWorkoutCommentsRequest(
        groupId,
        sessionId,
        async () => {
          if (!supabase) throw new Error("Supabase is not configured.");
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !data.session) throw new Error("Sign in to view comments.");
          const response = await fetch(
            `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/comments`,
            {
              headers: { Authorization: `Bearer ${data.session.access_token}` },
              signal: AbortSignal.timeout(7_500),
            },
          );
          const body = (await response.json()) as {
            comments?: CommunityPostComment[];
            error?: string;
          };
          if (!response.ok || !body.comments) {
            throw new Error(body.error ?? "Comments could not be loaded.");
          }
          return body.comments;
        },
      );
      writeWorkoutCommentsCache(groupId, sessionId, loadedComments);
      if (!mounted.current) return;
      setComments(loadedComments);
      onCommentCountChange?.(sessionId, loadedComments.length);
    } catch (loadError) {
      if (!mounted.current) return;
      setCommentError(
        loadError instanceof Error ? loadError.message : "Comments could not be loaded.",
      );
    } finally {
      if (mounted.current) setCommentsLoading(false);
    }
  }, [groupId, onCommentCountChange, sessionId]);

  useEffect(() => {
    if (fixture || refreshOnFocus) return;
    void loadWorkout();
    void loadComments();
  }, [fixture, loadComments, loadWorkout, refreshOnFocus]);

  useFocusEffect(useCallback(() => {
    if (fixture || !refreshOnFocus) return;
    void loadWorkout(true);
    void loadComments(true);
  }, [fixture, loadComments, loadWorkout, refreshOnFocus]));

  const toggleReaction = useCallback(async (reactionType: CommunityReactionType) => {
    if (!workout || reactionRequestPending.current) return;

    reactionRequestPending.current = true;
    setReactionPending(true);
    setReactionError(null);
    const previous = workout.reactions;
    const optimistic = getOptimisticReactionSummary(previous, reactionType);
    reactionsWereChanged.current = true;
    latestReactions.current = optimistic;
    setWorkout((current) => {
      if (!current) return current;
      const next = { ...current, reactions: optimistic };
      workoutRef.current = next;
      return next;
    });
    updateCachedWorkoutReactions(groupId, sessionId, optimistic);
    onReactionSummaryChange?.(sessionId, optimistic);

    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to react to this workout.");

      const removing = previous.viewerReaction === reactionType;
      const response = await fetch(
        `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/reaction`,
        {
          method: removing ? "DELETE" : "PUT",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            ...(!removing ? { "Content-Type": "application/json" } : {}),
          },
          ...(!removing ? { body: JSON.stringify({ reactionType }) } : {}),
          signal: AbortSignal.timeout(7_500),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        reactions?: CommunityReactionSummary;
      };
      if (!response.ok || !body.reactions) {
        throw new Error(body.error ?? "Reaction could not be updated.");
      }

      latestReactions.current = body.reactions;
      setWorkout((current) => {
        if (!current) return current;
        const next = { ...current, reactions: body.reactions! };
        workoutRef.current = next;
        return next;
      });
      updateCachedWorkoutReactions(groupId, sessionId, body.reactions);
      onReactionSummaryChange?.(sessionId, body.reactions);
    } catch {
      latestReactions.current = previous;
      setWorkout((current) => {
        if (!current) return current;
        const next = { ...current, reactions: previous };
        workoutRef.current = next;
        return next;
      });
      updateCachedWorkoutReactions(groupId, sessionId, previous);
      onReactionSummaryChange?.(sessionId, previous);
      setReactionError("Reaction could not be updated. Try again.");
    } finally {
      reactionRequestPending.current = false;
      setReactionPending(false);
    }
  }, [groupId, onReactionSummaryChange, sessionId, workout]);

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || text.length > 2_000 || commentRequestPending.current) return;

    commentRequestPending.current = true;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to comment on this workout.");

      const response = await fetch(
        `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(sessionId)}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(7_500),
        },
      );
      const body = (await response.json()) as {
        comment?: CommunityPostComment;
        error?: string;
      };
      if (!response.ok || !body.comment) {
        throw new Error(body.error ?? "Comment could not be posted.");
      }

      const nextComments = [...comments, body.comment];
      setComments(nextComments);
      writeWorkoutCommentsCache(groupId, sessionId, nextComments);
      setCommentText("");
      clearDraft();
      onCommentCountChange?.(sessionId, nextComments.length);
    } catch (submitError) {
      setCommentError(
        submitError instanceof Error
          ? submitError.message
          : "Comment could not be posted.",
      );
    } finally {
      commentRequestPending.current = false;
      setCommentSubmitting(false);
    }
  }, [clearDraft, commentText, comments, groupId, onCommentCountChange, sessionId, setCommentText]);

  const pinsComposer = presentation !== "default";
  const splitSession = presentation === "session" && mode === "twoPane";
  const composerPaddingBottom = presentation === "community-modal"
    ? spacing.lg
    : Math.max(insets.bottom, spacing.md);

  if (loading && !workout) {
    return (
      <View style={styles.surfaceInset}>
        {leading}
        <LoadingState message="Loading workout…" />
      </View>
    );
  }
  if (error && !workout) {
    return (
      <View style={styles.surfaceInset}>
        {leading}
        <WideColumn>
          <StateCard
            actionLabel="Try again"
            message={error}
            onAction={() => void loadWorkout()}
            title="Workout unavailable"
          />
        </WideColumn>
      </View>
    );
  }

  if (!workout) return null;

  const detail = (part: "all" | "comments" | "post") => (
    <WorkoutDetailContent
      commentError={commentError}
      commentSubmitting={commentSubmitting}
      commentText={commentText}
      comments={comments}
      commentsLoading={commentsLoading}
      detailError={error}
      detailExpansionResetKey={detailExpansionResetKey}
      detailPhotoMaxHeight={detailPhotoMaxHeight}
      onCommentChange={setCommentText}
      onCommentSubmit={() => void submitComment()}
      onCommentsRetry={() => void loadComments(true)}
      onReactionPress={(reactionType) => void toggleReaction(reactionType)}
      part={part}
      presentation={presentation}
      reactionError={reactionError}
      reactionPending={reactionPending || loading}
      showComposer={!pinsComposer}
      workout={workout}
    />
  );

  const composer = (
    <View style={[styles.composerDock, { paddingBottom: composerPaddingBottom }]}>
      <CommentComposer
        commentSubmitting={commentSubmitting}
        commentText={commentText}
        onCommentChange={setCommentText}
        onCommentSubmit={() => void submitComment()}
        pinned
        sessionId={sessionId}
      />
      {commentError && comments.length ? <Text style={styles.reactionError}>{commentError}</Text> : null}
    </View>
  );

  if (splitSession) {
    return (
      <KeyboardAvoidingView behavior={keyboardBehavior} style={styles.pane}>
        <TwoPane
          keyboardShouldPersistTaps="handled"
          left={(
            <View style={styles.splitColumn}>
              {leading}
              <Card style={styles.surfaceCard}>
                <View style={styles.surfaceClip}>
                  <ScrollView
                    contentContainerStyle={styles.surfaceScroll}
                    keyboardShouldPersistTaps="handled"
                    style={[styles.surfaceScroller, webScrollerStyle]}
                  >
                    {detail("post")}
                  </ScrollView>
                </View>
              </Card>
            </View>
          )}
          right={(
            <View style={styles.splitColumn}>
              <Card style={styles.surfaceCard}>
                <View style={styles.surfaceClip}>
                  <ScrollView
                    contentContainerStyle={styles.surfaceScroll}
                    keyboardShouldPersistTaps="handled"
                    style={[styles.surfaceScroller, webScrollerStyle]}
                  >
                    {detail("comments")}
                  </ScrollView>
                  {composer}
                </View>
              </Card>
            </View>
          )}
          scrollableLeft={false}
          scrollableRight={false}
        />
      </KeyboardAvoidingView>
    );
  }

  if (presentation === "community-modal") {
    return (
      <View style={styles.modalBody}>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onContentSizeChange={detailAnchor.onContentSizeChange}
          onLayout={detailAnchor.onViewportLayout}
          onScroll={detailAnchor.onScroll}
          ref={detailAnchor.scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          style={[styles.modalScroller, webScrollerStyle]}
        >
          <View collapsable={false} ref={detailAnchor.contentRef}>
            <ScrollAnchorProvider contentRef={detailAnchor.contentRef} onItemLayout={detailAnchor.onItemLayout} pane={null}>
              {detail("all")}
            </ScrollAnchorProvider>
          </View>
        </ScrollView>
        {composer}
      </View>
    );
  }

  if (presentation === "community-pane" || presentation === "session") {
    return (
      <KeyboardAvoidingView behavior={keyboardBehavior} style={styles.pane}>
        <View style={styles.surfaceInset}>
          {leading}
          <Card style={styles.surfaceCard}>
            <View style={styles.surfaceClip}>
              <ScrollView
                contentContainerStyle={styles.surfaceScroll}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={detailAnchor.onContentSizeChange}
                onLayout={detailAnchor.onViewportLayout}
                onScroll={detailAnchor.onScroll}
                ref={detailAnchor.scrollRef}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={[styles.surfaceScroller, webScrollerStyle]}
              >
                <View collapsable={false} ref={detailAnchor.contentRef}>
                  <ScrollAnchorProvider
                    contentRef={detailAnchor.contentRef}
                    onItemLayout={detailAnchor.onItemLayout}
                    pane={presentation === "community-pane" ? "right" : null}
                  >
                    {paneHeader}
                    {detail("all")}
                  </ScrollAnchorProvider>
                </View>
              </ScrollView>
              {composer}
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return detail("all");
}

export function WorkoutDetailContent({
  commentError,
  commentSubmitting = false,
  commentText = "",
  comments = [],
  commentsLoading = false,
  detailExpansionResetKey,
  detailPhotoMaxHeight,
  detailError,
  onCommentChange,
  onCommentSubmit,
  onCommentsRetry,
  onReactionPress,
  part = "all",
  presentation = "default",
  reactionError,
  reactionPending = false,
  showComposer = true,
  workout,
}: {
  commentError?: string | null;
  commentSubmitting?: boolean;
  commentText?: string;
  comments?: CommunityPostComment[];
  commentsLoading?: boolean;
  detailExpansionResetKey?: string;
  detailPhotoMaxHeight?: number;
  detailError?: string | null;
  onCommentChange?: (text: string) => void;
  onCommentSubmit?: () => void;
  onCommentsRetry?: () => void;
  onReactionPress?: (reactionType: CommunityReactionType) => void;
  part?: "all" | "comments" | "post";
  presentation?: "community-modal" | "community-pane" | "default" | "session";
  reactionError?: string | null;
  reactionPending?: boolean;
  showComposer?: boolean;
  workout: CommunityWorkoutDetail;
}) {
  const displayName = resolveUserDisplayName({ displayName: workout.displayName });
  const typeLabel = formatWorkoutType(workout.workoutType);
  const title = workout.name?.trim() || workout.title?.trim() || typeLabel;
  const caption = workout.caption?.trim() || workout.notes?.trim();
  const formattedMetrics = workout.metrics
    .map(formatWorkoutMetric)
    .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  const hasResults = formattedMetrics.length > 0 || workout.movements.length > 0 || workout.segments.length > 0;
  const groupedIntervals = groupConsecutiveIntervalSegments(workout.segments);
  const isCommunityModal = presentation === "community-modal";
  const isCommunitySheet = presentation !== "default";
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [workoutExpanded, setWorkoutExpanded] = useState(false);

  useEffect(() => {
    setWorkoutExpanded(false);
  }, [detailExpansionResetKey, workout.id]);

  const workoutResults = hasResults ? (
    <View style={[styles.resultsSection, isCommunitySheet && styles.modalResultsSection]}>
      {!isCommunitySheet ? <Text style={styles.sectionEyebrow}>WORKOUT RESULTS</Text> : null}
      {formattedMetrics.length ? (
        <Card style={[styles.metricsCard, isCommunitySheet && styles.modalMetricsCard]}>
          {formattedMetrics.map((metric, index) => (
            <View key={`${metric.label}-${index}`} style={[styles.metricRow, index > 0 && styles.dividedRow, isCommunitySheet && index > 0 && styles.modalDividedRow]}>
              <Text style={[styles.metricLabel, isCommunitySheet && styles.modalResultLabel]}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {workout.segments.length ? (
        <Card
          style={[
            styles.intervalCard,
            isCommunitySheet && styles.modalIntervalCard,
            isCommunitySheet && formattedMetrics.length > 0 && styles.modalStackedResultCard,
          ]}
        >
          <Text style={styles.intervalHeading}>Intervals</Text>
          {groupedIntervals.map((group, index) => {
            const formatted = formatGroupedIntervalSegment(group);
            return (
            <View key={`${group.segment.segmentType}-${index}`} style={[styles.intervalRow, index > 0 && styles.dividedRow, isCommunitySheet && index > 0 && styles.modalDividedRow]}>
              <View style={styles.intervalResult}>
                <Text style={styles.intervalValue}>{formatted.main}</Text>
                {formatted.recovery ? <Text style={styles.intervalRecovery}>{formatted.recovery}</Text> : null}
              </View>
            </View>
            );
          })}
        </Card>
      ) : null}

      {workout.movements.map((movement, movementIndex) => (
        <Card
          key={movement.id}
          style={[
            styles.movementCard,
            isCommunitySheet && styles.modalMovementCard,
            isCommunitySheet && (formattedMetrics.length > 0 || workout.segments.length > 0 || movementIndex > 0) && styles.modalStackedResultCard,
          ]}
        >
          <Text style={styles.movementName}>{movement.movementName}</Text>
          {movement.notes ? <Text style={styles.movementNotes}>{movement.notes}</Text> : null}
          {movement.sets.map((set, index) => (
            <View key={set.id} style={[styles.setRow, index > 0 && styles.dividedRow, isCommunitySheet && index > 0 && styles.modalDividedRow]}>
              <Text style={[styles.setLabel, isCommunitySheet && styles.modalResultLabel]}>Set {set.position + 1}</Text>
              <View style={styles.setResult}>
                <Text style={styles.setValue}>{formatWorkoutSet(set)}</Text>
                {set.notes ? <Text style={styles.setNotes}>{set.notes}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      ))}
    </View>
  ) : null;

  const summary = (
    <>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getUserInitials({ displayName: workout.displayName })}</Text>
        </View>
        <View style={styles.authorCopy}>
          <Text style={styles.author}>{displayName}</Text>
          <Text style={styles.timestamp}>{formatWorkoutDate(workout)}</Text>
        </View>
        {!isCommunityModal ? <View style={styles.typePill}><Text style={styles.typeText}>{typeLabel}</Text></View> : null}
      </View>

      <Text style={[styles.title, isCommunitySheet ? styles.sheetTitle : styles.defaultTitle]}>{title}</Text>
      {detailError ? <Text style={styles.detailError}>{detailError}</Text> : null}
      {workout.effort ? <Text accessibilityLabel={`Effort ${workout.effort} out of 5`} style={styles.effort}>{"🔥".repeat(workout.effort)}</Text> : null}
      {workout.resultSummary && (isCommunitySheet || !hasResults) ? (
        <Text style={styles.compatibilityDuration}>{workout.resultSummary}</Text>
      ) : !hasResults && workout.durationMinutes ? (
        <Text style={styles.compatibilityDuration}>{workout.durationMinutes} min</Text>
      ) : null}

      {caption ? isCommunitySheet ? (
        <Text style={[styles.caption, styles.modalCaption]}>{caption}</Text>
      ) : (
        <View style={styles.postSection}>
          <Text style={styles.sectionEyebrow}>POST</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      ) : null}

      {workout.photoUrl ? (
        <WorkoutPhoto
          detailMaxHeight={detailPhotoMaxHeight}
          onPress={isCommunitySheet ? () => setPhotoViewerVisible(true) : undefined}
          uri={workout.photoUrl}
          variant="detail"
        />
      ) : null}
    </>
  );

  const disclosure = isCommunitySheet && hasResults ? (
    <Pressable
      accessibilityLabel={workoutExpanded ? "Hide workout details" : "View workout details"}
      accessibilityRole="button"
      accessibilityState={{ expanded: workoutExpanded }}
      onPress={() => setWorkoutExpanded((expanded) => !expanded)}
      style={({ pressed }) => [styles.workoutDisclosureButton, pressed && styles.reactionButtonPressed]}
    >
      <Text style={styles.workoutDisclosureText}>{workoutExpanded ? "Hide workout" : "View workout"}</Text>
      <Chevron color={colors.inkSoft} direction={workoutExpanded ? "up" : "down"} size={size.icon.sm} />
    </Pressable>
  ) : null;

  return (
    <View>
      {part !== "comments" ? (
        <>
          <ScrollAnchor id={`detail-summary:${workout.id}`}>
            {summary}
          </ScrollAnchor>
          {!isCommunitySheet ? workoutResults : null}
          <ScrollAnchor id={`detail-reactions:${workout.id}`}>
            {isCommunitySheet ? (
              <View style={styles.sheetMetaRow}>
                <View style={styles.sheetReactions}>
                  <CommunityModalReactionRow
                    onReactionPress={onReactionPress}
                    reactionPending={reactionPending}
                    reactions={workout.reactions}
                  />
                  {reactionError ? <Text style={styles.reactionError}>{reactionError}</Text> : null}
                </View>
                {disclosure}
              </View>
            ) : (
              <View style={styles.reactionSection}>
                <Text style={styles.sectionEyebrow}>REACTIONS</Text>
                <View style={styles.reactionRow}>
                  {communityReactionTypes.map((reactionType) => {
                    const option = reactionOptions[reactionType];
                    const selected = workout.reactions.viewerReaction === reactionType;
                    const count = workout.reactions.counts[reactionType];
                    return (
                      <Pressable
                        accessibilityLabel={`${option.label}, ${count} reaction${count === 1 ? "" : "s"}${selected ? ", selected" : ""}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: reactionPending }}
                        disabled={reactionPending || !onReactionPress}
                        key={reactionType}
                        onPress={() => onReactionPress?.(reactionType)}
                        style={({ pressed }) => [
                          styles.reactionButton,
                          selected && styles.reactionButtonSelected,
                          pressed && styles.reactionButtonPressed,
                        ]}
                      >
                        <Text style={styles.reactionEmoji}>{option.emoji}</Text>
                        <Text style={[styles.reactionCount, selected && styles.reactionCountSelected]}>{count}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {reactionError ? <Text style={styles.reactionError}>{reactionError}</Text> : null}
              </View>
            )}
          </ScrollAnchor>
          {isCommunitySheet && workoutExpanded ? workoutResults : null}
        </>
      ) : null}

      {part !== "post" ? (
      <ScrollAnchor id={`detail-comments:${workout.id}`}>
      <View style={[styles.commentsSection, isCommunitySheet && styles.modalCommentsSection, part === "comments" && styles.splitCommentsSection]}>
        <Text style={isCommunitySheet ? styles.commentsHeading : styles.sectionEyebrow}>{isCommunitySheet ? "Comments" : "COMMENTS"}</Text>
        {commentsLoading && !comments.length ? (
          <View style={styles.commentsLoading}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={styles.commentMuted}>Loading comments…</Text>
          </View>
        ) : comments.length ? (
          <View style={styles.commentList}>
            {isCommunitySheet ? groupCommentsByLocalDate(comments).map((group, groupIndex) => (
              <View key={group.key} style={[styles.commentDateGroup, groupIndex === 0 && styles.firstCommentDateGroup]}>
                <Text style={styles.commentDateLabel}>{group.label}</Text>
                {group.comments.map((comment) => (
                  <ScrollAnchor id={`comment:${comment.id}`} key={comment.id}>
                  <View style={[styles.commentRow, styles.modalCommentRow]}>
                    <View style={[styles.commentHeader, styles.modalCommentHeader]}>
                      <Text style={styles.commentAuthor}>{resolveUserDisplayName({ displayName: comment.displayName })}</Text>
                      <Text style={styles.commentSeparator}>·</Text>
                      <Text style={[styles.commentTimestamp, styles.modalCommentTimestamp]}>{formatCommentTime(comment.createdAt)}</Text>
                    </View>
                    <Text style={[styles.commentBody, styles.modalCommentBody]}>{comment.text}</Text>
                  </View>
                  </ScrollAnchor>
                ))}
              </View>
            )) : comments.map((comment, index) => (
              <ScrollAnchor id={`comment:${comment.id}`} key={comment.id}>
              <View style={[styles.commentRow, index > 0 && styles.dividedRow]}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{resolveUserDisplayName({ displayName: comment.displayName })}</Text>
                  <Text style={styles.commentTimestamp}>{formatCommentTimestamp(comment.createdAt)}</Text>
                </View>
                <Text style={styles.commentBody}>{comment.text}</Text>
              </View>
              </ScrollAnchor>
            ))}
          </View>
        ) : (
          <Text style={styles.commentEmpty}>No comments yet.</Text>
        )}

        {showComposer && onCommentChange && onCommentSubmit ? (
          <CommentComposer
            commentSubmitting={commentSubmitting}
            commentText={commentText}
            onCommentChange={onCommentChange}
            onCommentSubmit={onCommentSubmit}
            sessionId={workout.id}
          />
        ) : null}
        {commentError && (showComposer || !comments.length) ? (
          <View style={styles.commentErrorRow}>
            <Text style={styles.reactionError}>{commentError}</Text>
            {onCommentsRetry && !comments.length ? (
              <Pressable accessibilityRole="button" onPress={onCommentsRetry}>
                <Text style={styles.commentRetry}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      </ScrollAnchor>
      ) : null}
      {part !== "comments" && isCommunitySheet && workout.photoUrl ? (
        <PhotoViewer
          images={[{ accessibilityLabel: `${title} workout photo`, uri: workout.photoUrl }]}
          initialIndex={0}
          onRequestClose={() => setPhotoViewerVisible(false)}
          visible={photoViewerVisible}
        />
      ) : null}
    </View>
  );
}

function CommentComposer({
  commentSubmitting,
  commentText,
  onCommentChange,
  onCommentSubmit,
  pinned = false,
  sessionId,
}: {
  commentSubmitting: boolean;
  commentText: string;
  onCommentChange: (text: string) => void;
  onCommentSubmit: () => void;
  pinned?: boolean;
  sessionId: string;
}) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [commentInputHeight, setCommentInputHeight] = useState<number>(size.hit);
  const empty = !commentText.trim();

  useEffect(() => {
    if (!commentText) setCommentInputHeight(size.hit);
  }, [commentText]);

  useEffect(() => {
    if (focusedComposerSession !== sessionId) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [sessionId]);

  return (
    <View style={[styles.composer, pinned && styles.composerPinned]}>
      <TextInput
        accessibilityLabel="Add a comment"
        editable={!commentSubmitting}
        maxLength={2_000}
        multiline
        onBlur={() => {
          if (composerBlurTimer) clearTimeout(composerBlurTimer);
          composerBlurTimer = setTimeout(() => markComposerBlurred(sessionId), 200);
        }}
        onChangeText={onCommentChange}
        onContentSizeChange={(event) => {
          setCommentInputHeight(
            Math.min(commentFieldMaxHeight, Math.max(size.hit, Math.ceil(event.nativeEvent.contentSize.height))),
          );
        }}
        onFocus={() => {
          if (composerBlurTimer) clearTimeout(composerBlurTimer);
          markComposerFocused(sessionId);
        }}
        placeholder="Add a comment..."
        placeholderTextColor={colors.muted}
        ref={inputRef}
        scrollEnabled={commentInputHeight >= commentFieldMaxHeight}
        style={[styles.commentInput, { height: commentInputHeight }]}
        textAlignVertical={commentInputHeight > size.hit ? "top" : "center"}
        value={commentText}
      />
      <Pressable
        accessibilityLabel="Post comment"
        accessibilityRole="button"
        accessibilityState={{ disabled: commentSubmitting || empty }}
        disabled={commentSubmitting || empty}
        onPress={onCommentSubmit}
        style={(state) => {
          const ready = !empty && !commentSubmitting;
          const backgroundColor = ready || commentSubmitting
            ? (state.pressed && ready ? colors.brandPressed : colors.brand)
            : colors.disabledFill;
          return [
            styles.sendButton,
            { backgroundColor },
            webFocusRing(pressableFocused(state)),
          ];
        }}
      >
        {commentSubmitting ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Chevron
            color={empty ? colors.disabledText : colors.surface}
            direction="right"
            size={size.icon.md}
          />
        )}
      </Pressable>
    </View>
  );
}

const reactionOptions: Record<CommunityReactionType, { emoji: string; label: string }> = {
  fire: { emoji: "🔥", label: "Fire" },
  strong: { emoji: "💪", label: "Strong" },
  clap: { emoji: "👏", label: "Clap" },
};

function CommunityModalReactionRow({
  onReactionPress,
  reactionPending,
  reactions,
}: {
  onReactionPress?: (reactionType: CommunityReactionType) => void;
  reactionPending: boolean;
  reactions: CommunityReactionSummary;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const pickerProgress = useRef(new Animated.Value(0)).current;
  const visibleReactions = communityReactionTypes.filter(
    (reactionType) => reactions.counts[reactionType] > 0,
  );

  useEffect(() => () => pickerProgress.stopAnimation(), [pickerProgress]);

  const openPicker = useCallback(() => {
    setPickerVisible(true);
    setPickerOpen(true);
    pickerProgress.stopAnimation();
    pickerProgress.setValue(0);
    Animated.timing(pickerProgress, {
      duration: 160,
      easing: Easing.out((value) => Easing.cubic(value)),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [pickerProgress]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    pickerProgress.stopAnimation();
    Animated.timing(pickerProgress, {
      duration: 120,
      easing: Easing.in((value) => Easing.quad(value)),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPickerVisible(false);
    });
  }, [pickerProgress]);

  const chooseReaction = useCallback((reactionType: CommunityReactionType) => {
    closePicker();
    onReactionPress?.(reactionType);
  }, [closePicker, onReactionPress]);

  return (
    <View style={styles.compactReactionRow}>
      {visibleReactions.length ? (
        <View style={styles.reactionSummaryRow}>
          {visibleReactions.map((reactionType) => {
            const option = reactionOptions[reactionType];
            const count = reactions.counts[reactionType];
            const selected = reactions.viewerReaction === reactionType;
            return (
              <Pressable
                accessibilityLabel={`React with ${option.label}, ${count} reaction${count === 1 ? "" : "s"}`}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: reactionPending }}
                disabled={reactionPending || !onReactionPress}
                key={reactionType}
                onPress={() => chooseReaction(reactionType)}
                style={({ pressed }) => [
                  styles.compactReactionChoice,
                  pressed && styles.reactionButtonPressed,
                ]}
              >
                <View style={[styles.compactReactionSummary, selected && styles.compactReactionSummarySelected]}>
                  <Text style={styles.compactReactionEmoji}>{option.emoji}</Text>
                  <Text style={[styles.compactReactionCount, selected && styles.reactionCountSelected]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityLabel="Add reaction"
        accessibilityRole="button"
        accessibilityState={{ disabled: reactionPending, expanded: pickerOpen }}
        disabled={reactionPending || !onReactionPress}
        onPress={pickerOpen ? closePicker : openPicker}
        style={({ pressed }) => [
          styles.addReactionButton,
          pressed && styles.reactionButtonPressed,
        ]}
      >
        <Feather color={pickerOpen ? colors.muted : colors.subtle} name="smile" size={17} />
        <Text style={[styles.addReactionPlus, pickerOpen && styles.addReactionPlusOpen]}>+</Text>
      </Pressable>

      {pickerVisible ? (
        <Animated.View
          pointerEvents={pickerOpen ? "auto" : "none"}
          style={[
            styles.reactionPicker,
            {
              opacity: pickerProgress,
              transform: [
                {
                  translateX: pickerProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-14, 0],
                  }),
                },
                {
                  scaleX: pickerProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {communityReactionTypes.map((reactionType) => {
            const option = reactionOptions[reactionType];
            const selected = reactions.viewerReaction === reactionType;
            return (
              <Pressable
                accessibilityLabel={`React with ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: reactionPending }}
                disabled={reactionPending}
                key={reactionType}
                onPress={() => chooseReaction(reactionType)}
                style={({ pressed }) => [
                  styles.reactionPickerChoice,
                  pressed && styles.reactionButtonPressed,
                ]}
              >
                <View style={[styles.reactionPickerCircle, selected && styles.reactionPickerCircleSelected]}>
                  <Text style={styles.reactionPickerEmoji}>{option.emoji}</Text>
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

function getOptimisticReactionSummary(
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

function emptyCommunityReactionSummary(): CommunityReactionSummary {
  return {
    counts: { fire: 0, strong: 0, clap: 0 },
    total: 0,
    viewerReaction: null,
  };
}

function createSeedWorkoutDetail(
  workout: WorkoutFeedItem,
  cachedReactions: CommunityReactionSummary | null,
): CommunityWorkoutDetail {
  const counts = workout.reactionCounts ?? { fire: 0, strong: 0, clap: 0 };
  return {
    ...workout,
    communityPostId: "",
    workoutSubtype: null,
    metrics: [],
    movements: [],
    segments: [],
    reactions: cachedReactions ?? {
      counts,
      total: counts.fire + counts.strong + counts.clap,
      viewerReaction: null,
    },
  };
}

function formatCommentTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function groupCommentsByLocalDate(comments: CommunityPostComment[]) {
  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday);

  return comments.reduce<Array<{
    comments: CommunityPostComment[];
    key: string;
    label: string;
  }>>((groups, comment) => {
    const date = new Date(comment.createdAt);
    const validDate = !Number.isNaN(date.getTime());
    const dateKey = validDate ? getLocalDateKey(date) : `invalid-${comment.id}`;
    const previousGroup = groups.at(-1);

    if (previousGroup?.key === dateKey) {
      previousGroup.comments.push(comment);
      return groups;
    }

    const label = !validDate
      ? "Recently"
      : dateKey === todayKey
        ? "Today"
        : dateKey === yesterdayKey
          ? "Yesterday"
          : new Intl.DateTimeFormat(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(date);

    groups.push({ comments: [comment], key: dateKey, label });
    return groups;
  }, []);
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

const styles = StyleSheet.create({
  pane: { flex: 1, minHeight: 0 },
  surfaceInset: { flex: 1, minHeight: 0, padding: spacing.md },
  splitColumn: { flex: 1, minHeight: 0, padding: spacing.md },
  surfaceCard: { flex: 1, minHeight: 0, padding: 0 },
  surfaceClip: { borderRadius: radii.lg, flex: 1, minHeight: 0, overflow: "hidden" },
  surfaceScroller: { flex: 1, minHeight: 0 },
  surfaceScroll: { padding: spacing.lg },
  modalBody: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  modalScroller: { flexGrow: 0, flexShrink: 1 },
  modalScroll: { paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  composerDock: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  composerPinned: { marginTop: 0 },
  authorRow: { alignItems: "center", flexDirection: "row" },
  avatar: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: 44, justifyContent: "center", width: 44 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 13 },
  authorCopy: { flex: 1, marginLeft: spacing.md },
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16 },
  timestamp: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  typePill: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 11 },
  title: { color: colors.ink, marginTop: spacing.xxl },
  defaultTitle: { ...type.screenTitle },
  sheetTitle: { ...type.cardTitle, marginTop: spacing.lg },
  effort: { fontSize: 18, lineHeight: 24, marginTop: spacing.sm },
  detailError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
  resultsSection: { marginTop: spacing.xxxl },
  modalResultsSection: { marginTop: spacing.sm },
  sectionEyebrow: { color: colors.brand, ...type.eyebrow },
  metricsCard: { marginTop: spacing.md, paddingVertical: spacing.xs },
  modalMetricsCard: { backgroundColor: colors.surfaceMuted, borderWidth: 0, boxShadow: "none", marginTop: 0 },
  metricRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  metricLabel: { color: colors.muted, ...type.bodySmall },
  modalResultLabel: { color: colors.inkSoft },
  metricValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  dividedRow: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  modalDividedRow: { borderTopColor: colors.borderStrong },
  intervalCard: { marginTop: spacing.md, padding: spacing.lg },
  modalIntervalCard: { backgroundColor: colors.surfaceMuted, borderWidth: 0, boxShadow: "none", marginTop: 0 },
  intervalHeading: { color: colors.ink, ...type.heading, marginBottom: spacing.xs },
  intervalRow: { alignItems: "flex-start", flexDirection: "row", minHeight: 54, paddingVertical: spacing.md },
  intervalResult: { flex: 1 },
  intervalValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  intervalRecovery: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  movementCard: { marginTop: spacing.md, padding: spacing.lg },
  modalMovementCard: { backgroundColor: colors.surfaceMuted, borderWidth: 0, boxShadow: "none", marginTop: 0 },
  modalStackedResultCard: { marginTop: spacing.md },
  movementName: { color: colors.ink, ...type.heading },
  movementNotes: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  setRow: { alignItems: "flex-start", flexDirection: "row", minHeight: 48, paddingVertical: spacing.md },
  setLabel: { color: colors.muted, ...type.label, width: 58 },
  setResult: { flex: 1 },
  setValue: { color: colors.inkSoft, ...type.bodyMedium },
  setNotes: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  postSection: { marginTop: spacing.xxxl },
  caption: { color: colors.inkSoft, ...type.body, marginTop: spacing.md },
  modalCaption: { marginTop: spacing.lg },
  compatibilityDuration: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: spacing.lg },
  sheetMetaRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.lg },
  sheetReactions: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  workoutDisclosureButton: { alignItems: "center", flexDirection: "row", flexShrink: 0, gap: spacing.sm, minHeight: size.hit },
  workoutDisclosureText: { color: colors.inkSoft, ...type.bodySmall, fontFamily: fonts.medium },
  reactionSection: { marginTop: spacing.xxxl },
  reactionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  reactionButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md },
  reactionButtonSelected: { backgroundColor: colors.surfaceMuted, borderColor: colors.brand },
  reactionButtonPressed: { opacity: 0.72 },
  reactionEmoji: { fontSize: 17, lineHeight: 22 },
  reactionCount: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14 },
  reactionCountSelected: { color: colors.brandPressed },
  reactionError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
  compactReactionRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, minHeight: 44 },
  reactionSummaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  compactReactionChoice: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  compactReactionSummary: { alignItems: "center", borderRadius: radii.pill, flexDirection: "row", gap: 3, minHeight: 30, paddingHorizontal: spacing.sm },
  compactReactionSummarySelected: { backgroundColor: colors.surfaceMuted },
  compactReactionEmoji: { fontSize: 14, lineHeight: 18 },
  compactReactionCount: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  addReactionButton: { alignItems: "center", height: 44, justifyContent: "center", marginLeft: spacing.xs, position: "relative", width: 44 },
  addReactionPlus: { bottom: 5, color: colors.subtle, fontFamily: fonts.bold, fontSize: 11, height: 13, lineHeight: 12, position: "absolute", right: 5, textAlign: "center", width: 13 },
  addReactionPlusOpen: { color: colors.muted },
  reactionPicker: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginLeft: spacing.xs },
  reactionPickerChoice: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  reactionPickerCircle: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  reactionPickerCircleSelected: { backgroundColor: colors.surfaceMuted, borderColor: colors.brand },
  reactionPickerEmoji: { fontSize: 15, lineHeight: 20 },
  commentsSection: { marginTop: spacing.xxxl },
  modalCommentsSection: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.lg, paddingTop: spacing.lg },
  splitCommentsSection: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  commentsHeading: { color: colors.ink, ...type.heading },
  commentsLoading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, minHeight: 44 },
  commentMuted: { color: colors.muted, ...type.bodySmall },
  commentList: { marginTop: spacing.sm },
  commentDateGroup: { marginTop: spacing.md },
  firstCommentDateGroup: { marginTop: spacing.xs },
  commentDateLabel: { color: colors.subtle, ...type.bodySmall, textAlign: "center" },
  commentRow: { paddingVertical: spacing.md },
  commentHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  modalCommentRow: { paddingVertical: spacing.sm },
  modalCommentHeader: { justifyContent: "flex-start" },
  commentAuthor: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  commentTimestamp: { color: colors.muted, ...type.bodySmall, marginLeft: spacing.md },
  commentSeparator: { color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginLeft: spacing.xs },
  modalCommentTimestamp: { color: colors.subtle, fontSize: 12, marginLeft: spacing.xs },
  commentBody: { color: colors.inkSoft, ...type.body, marginTop: spacing.xs },
  modalCommentBody: { color: colors.ink, marginTop: 2 },
  commentEmpty: { color: colors.muted, ...type.bodySmall, marginTop: spacing.md },
  composer: { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  commentInput: { ...type.body, backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, color: colors.ink, flex: 1, maxHeight: commentFieldMaxHeight, minHeight: size.hit, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sendButton: { alignItems: "center", borderRadius: radii.pill, height: size.hit, justifyContent: "center", width: size.hit },
  commentErrorRow: { marginTop: spacing.sm },
  commentRetry: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 13, marginTop: spacing.xs },
});
