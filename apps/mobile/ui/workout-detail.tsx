import {
  communityReactionTypes,
  getUserInitials,
  resolveUserDisplayName,
  type CommunityReactionSummary,
  type CommunityReactionType,
  type CommunityWorkoutDetail,
} from "@repin/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import {
  formatWorkoutMetric,
  formatWorkoutSet,
} from "../lib/workout-detail-format";
import { formatWorkoutDate } from "../lib/workout-date";
import {
  Card,
  formatWorkoutType,
  LoadingState,
  StateCard,
} from "./components";
import { colors, fonts, radii, spacing, type } from "./theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function WorkoutDetailView({
  groupId,
  onReactionSummaryChange,
  refreshOnFocus = false,
  sessionId,
}: {
  groupId: string;
  onReactionSummaryChange?: (sessionId: string, reactions: CommunityReactionSummary) => void;
  refreshOnFocus?: boolean;
  sessionId: string;
}) {
  const [workout, setWorkout] = useState<CommunityWorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionPending, setReactionPending] = useState(false);
  const reactionRequestPending = useRef(false);

  const loadWorkout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
      const workoutWithReactions = {
        ...body.workout,
        reactions: body.workout.reactions ?? emptyCommunityReactionSummary(),
      };
      setWorkout(workoutWithReactions);
      onReactionSummaryChange?.(sessionId, workoutWithReactions.reactions);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Workout details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, onReactionSummaryChange, sessionId]);

  useEffect(() => {
    if (!refreshOnFocus) void loadWorkout();
  }, [loadWorkout, refreshOnFocus]);

  useFocusEffect(useCallback(() => {
    if (refreshOnFocus) void loadWorkout();
  }, [loadWorkout, refreshOnFocus]));

  const toggleReaction = useCallback(async (reactionType: CommunityReactionType) => {
    if (!workout || reactionRequestPending.current) return;

    reactionRequestPending.current = true;
    setReactionPending(true);
    setReactionError(null);
    const previous = workout.reactions;
    const optimistic = getOptimisticReactionSummary(previous, reactionType);
    setWorkout((current) => current ? { ...current, reactions: optimistic } : current);
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

      setWorkout((current) => current ? { ...current, reactions: body.reactions! } : current);
      onReactionSummaryChange?.(sessionId, body.reactions);
    } catch {
      setWorkout((current) => current ? { ...current, reactions: previous } : current);
      onReactionSummaryChange?.(sessionId, previous);
      setReactionError("Reaction could not be updated. Try again.");
    } finally {
      reactionRequestPending.current = false;
      setReactionPending(false);
    }
  }, [groupId, onReactionSummaryChange, sessionId, workout]);

  if (loading && !workout) return <LoadingState message="Loading workout…" />;
  if (error && !workout) {
    return (
      <StateCard
        actionLabel="Try again"
        message={error}
        onAction={() => void loadWorkout()}
        title="Workout unavailable"
      />
    );
  }

  return workout ? (
    <WorkoutDetailContent
      onReactionPress={(reactionType) => void toggleReaction(reactionType)}
      reactionError={reactionError}
      reactionPending={reactionPending}
      workout={workout}
    />
  ) : null;
}

export function WorkoutDetailContent({
  onReactionPress,
  reactionError,
  reactionPending = false,
  workout,
}: {
  onReactionPress?: (reactionType: CommunityReactionType) => void;
  reactionError?: string | null;
  reactionPending?: boolean;
  workout: CommunityWorkoutDetail;
}) {
  const displayName = resolveUserDisplayName({ displayName: workout.displayName });
  const typeLabel = formatWorkoutType(workout.workoutType);
  const title = workout.name?.trim() || workout.title?.trim() || typeLabel;
  const caption = workout.caption?.trim() || workout.notes?.trim();
  const formattedMetrics = workout.metrics
    .map(formatWorkoutMetric)
    .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  const hasResults = formattedMetrics.length > 0 || workout.movements.length > 0;

  return (
    <View>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getUserInitials({ displayName: workout.displayName })}</Text>
        </View>
        <View style={styles.authorCopy}>
          <Text style={styles.author}>{displayName}</Text>
          <Text style={styles.timestamp}>{formatWorkoutDate(workout)}</Text>
        </View>
        <View style={styles.typePill}><Text style={styles.typeText}>{typeLabel}</Text></View>
      </View>

      <Text style={styles.title}>{title}</Text>
      {workout.effort ? <Text accessibilityLabel={`Effort ${workout.effort} out of 5`} style={styles.effort}>{"🔥".repeat(workout.effort)}</Text> : null}
      {!hasResults && workout.durationMinutes ? (
        <Text style={styles.compatibilityDuration}>{workout.durationMinutes} min</Text>
      ) : null}

      {hasResults ? (
        <View style={styles.resultsSection}>
          <Text style={styles.sectionEyebrow}>WORKOUT RESULTS</Text>
          {formattedMetrics.length ? (
            <Card style={styles.metricsCard}>
              {formattedMetrics.map((metric, index) => (
                <View key={`${metric.label}-${index}`} style={[styles.metricRow, index > 0 && styles.dividedRow]}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {workout.movements.map((movement) => (
            <Card key={movement.id} style={styles.movementCard}>
              <Text style={styles.movementName}>{movement.movementName}</Text>
              {movement.notes ? <Text style={styles.movementNotes}>{movement.notes}</Text> : null}
              {movement.sets.map((set, index) => (
                <View key={set.id} style={[styles.setRow, index > 0 && styles.dividedRow]}>
                  <Text style={styles.setLabel}>Set {set.position + 1}</Text>
                  <View style={styles.setResult}>
                    <Text style={styles.setValue}>{formatWorkoutSet(set)}</Text>
                    {set.notes ? <Text style={styles.setNotes}>{set.notes}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          ))}
        </View>
      ) : null}

      {caption ? (
        <View style={styles.postSection}>
          <Text style={styles.sectionEyebrow}>POST</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      ) : null}

      {workout.photoUrl ? (
        <Image
          accessibilityLabel="Workout photo"
          resizeMode="cover"
          source={{ uri: workout.photoUrl }}
          style={styles.photo}
        />
      ) : null}

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
    </View>
  );
}

const reactionOptions: Record<CommunityReactionType, { emoji: string; label: string }> = {
  fire: { emoji: "🔥", label: "Fire" },
  strong: { emoji: "💪", label: "Strong" },
  clap: { emoji: "👏", label: "Clap" },
};

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

const styles = StyleSheet.create({
  authorRow: { alignItems: "center", flexDirection: "row" },
  avatar: { alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radii.pill, height: 44, justifyContent: "center", width: 44 },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: 13 },
  authorCopy: { flex: 1, marginLeft: spacing.md },
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16 },
  timestamp: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  typePill: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 11 },
  title: { color: colors.ink, ...type.screenTitle, marginTop: spacing.xxl },
  effort: { fontSize: 18, lineHeight: 24, marginTop: spacing.sm },
  resultsSection: { marginTop: spacing.xxxl },
  sectionEyebrow: { color: colors.brand, ...type.eyebrow },
  metricsCard: { marginTop: spacing.md, paddingVertical: spacing.xs },
  metricRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  metricLabel: { color: colors.muted, ...type.bodySmall },
  metricValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  dividedRow: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  movementCard: { marginTop: spacing.md, padding: spacing.lg },
  movementName: { color: colors.ink, ...type.heading },
  movementNotes: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  setRow: { alignItems: "flex-start", flexDirection: "row", minHeight: 48, paddingVertical: spacing.md },
  setLabel: { color: colors.muted, ...type.label, width: 58 },
  setResult: { flex: 1 },
  setValue: { color: colors.inkSoft, ...type.bodyMedium },
  setNotes: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  postSection: { marginTop: spacing.xxxl },
  caption: { color: colors.inkSoft, ...type.body, marginTop: spacing.md },
  photo: { aspectRatio: 16 / 10, borderRadius: radii.md, marginTop: spacing.lg, width: "100%" },
  compatibilityDuration: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: spacing.lg },
  reactionSection: { marginTop: spacing.xxxl },
  reactionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  reactionButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md },
  reactionButtonSelected: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  reactionButtonPressed: { opacity: 0.72 },
  reactionEmoji: { fontSize: 17, lineHeight: 22 },
  reactionCount: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14 },
  reactionCountSelected: { color: colors.brandPressed },
  reactionError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.sm },
});
