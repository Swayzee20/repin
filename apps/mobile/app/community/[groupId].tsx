import type { GroupSummary, WorkoutFeedItem } from "@repin/types";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";

import { fetchGroupBoard } from "../../lib/group-board";
import { supabase } from "../../lib/supabase";
import {
  BackButton,
  CommunityFeed,
  LoadingState,
  StateCard,
} from "../../ui/components";
import { colors, spacing, type, radii } from "../../ui/theme";

const boardEntering = new Keyframe({
  0: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(220);

const supportsNativeBoardZoom =
  Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 18;

export default function CommunityBoardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(params.groupId)
    ? params.groupId[0]
    : params.groupId;
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedHeight, setFeedHeight] = useState(0);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!groupId) throw new Error("This Community Board link is invalid.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Sign in to view this Community Board.");
      }

      const board = await fetchGroupBoard({
        accessToken: data.session.access_token,
        groupId,
      });
      setGroup(board.group);
      setWorkouts(board.workouts);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Community Board could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard]),
  );

  const measureFeed = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height);
    setFeedHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);

  return (
    <Link.AppleZoomTarget>
      <Animated.View
        entering={supportsNativeBoardZoom ? undefined : boardEntering}
        style={styles.animatedScreen}
      >
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.eyebrow}>YOUR CREW</Text>
        <Text style={styles.title}>Community Board</Text>
        {group ? <Text style={styles.groupName}>{group.name}</Text> : null}

        {loading && !group ? (
          <LoadingState message="Loading Community Board…" />
        ) : error && !group ? (
          <StateCard
            actionLabel="Try again"
            message={error}
            onAction={() => void loadBoard()}
            title="Board unavailable"
          />
        ) : group ? (
          <View style={styles.board}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {workouts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>The board is quiet</Text>
                <Text style={styles.emptyCopy}>
                  Workouts from this group will appear here.
                </Text>
              </View>
            ) : (
              <View onLayout={measureFeed} style={styles.feedArea}>
                {feedHeight > 0 ? (
                  <CommunityFeed
                    mode="full"
                    viewportHeight={feedHeight}
                    workouts={workouts}
                  />
                ) : null}
              </View>
            )}
          </View>
        ) : null}
        </View>
        </SafeAreaView>
      </Animated.View>
    </Link.AppleZoomTarget>
  );
}

const styles = StyleSheet.create({
  animatedScreen: { backgroundColor: colors.background, flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  container: { flex: 1, padding: spacing.xxl, paddingBottom: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.screenTitle, marginTop: spacing.xs },
  groupName: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  board: { backgroundColor: colors.board, borderColor: colors.boardBorder, borderRadius: radii.xl, borderWidth: 1, flex: 1, marginTop: spacing.lg, overflow: "hidden", padding: spacing.sm },
  feedArea: { flex: 1, minHeight: 0 },
  error: { color: colors.danger, ...type.bodySmall, padding: spacing.sm },
  emptyState: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xxl },
  emptyTitle: { color: colors.ink, ...type.heading },
  emptyCopy: { color: colors.muted, ...type.bodySmall, marginTop: spacing.sm, textAlign: "center" },
});
