import type {
  CommunityActivityItem,
  CommunityHighlights,
  CommunityProgress,
} from "@repin/types";
import { communityRevampCopy, type CrewWeekQuery } from "@repin/validation";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchCrewActivity,
  fetchCrewHighlights,
  fetchCrewProgress,
} from "../lib/community-revamp-api";
import {
  communityContextOpensPushed,
  type CommunityContextPane,
} from "../lib/community-revamp-layout";
import { supabase } from "../lib/supabase";
import { communityDeviceTimeZone } from "../lib/community-feed-days";
import { RoundIconButton } from "./primitives";
import { pushedHeaderClearance, pushedNativeHeaderEnabled, pushedShowsRoundBack } from "./pushed-header";
import { tabScreenTopStyle, useLayoutMode } from "./layout";
import { useMainTabs } from "./main-tabs-context";
import { useStripState } from "./vertical-bar-edge";
import { colors, spacing, type } from "./theme";
import {
  CrewActivityView,
  CrewHighlightsView,
  CrewProgressView,
} from "./community-revamp";

export function CommunityContextScreen({
  onOpenPost,
  pane,
}: {
  onOpenPost?: (input: { postId: string; sessionId: string | null }) => void;
  pane: CommunityContextPane;
}) {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const insets = useSafeAreaInsets();
  const strip = useStripState();
  const { selectedGroupId, setSelectedGroupId } = useMainTabs();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupParam = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  useEffect(() => {
    if (groupParam && groupParam !== selectedGroupId) setSelectedGroupId(groupParam);
  }, [groupParam, selectedGroupId, setSelectedGroupId]);
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = pushedHeaderClearance(Platform.OS, strip);
  const title = pane === "progress"
    ? communityRevampCopy.progress
    : pane === "highlights"
      ? communityRevampCopy.highlights
      : communityRevampCopy.activityTitle;

  useEffect(() => {
    if (communityContextOpensPushed(mode)) return;
    router.replace({ pathname: "/community", params: { pane } });
  }, [mode, pane, router]);

  if (!communityContextOpensPushed(mode)) return null;

  return (
    <View style={[styles.safeArea, tabScreenTopStyle(insets.top)]}>
      <SafeAreaView edges={["left", "right", "bottom"]} style={styles.flex}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <View style={styles.headerRow}>
            {roundBack ? (
              <RoundIconButton accessibilityLabel="Back" kind="back" onPress={() => router.back()} />
            ) : null}
            {roundBack || !nativeHeader ? <Text style={styles.title}>{title}</Text> : null}
          </View>
          <View style={styles.body}>
            <CommunityContextBody
              groupId={selectedGroupId}
              onOpenPost={onOpenPost}
              pane={pane}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function CommunityContextBody({
  compactTitle = false,
  groupId,
  onOpenPost,
  pane,
}: {
  compactTitle?: boolean;
  groupId: string | null;
  onOpenPost?: (input: { postId: string; sessionId: string | null }) => void;
  pane: CommunityContextPane;
}) {
  const [week, setWeek] = useState<CrewWeekQuery>("current");
  const [progress, setProgress] = useState<CommunityProgress | null>(null);
  const [highlights, setHighlights] = useState<CommunityHighlights | null>(null);
  const [memberCount, setMemberCount] = useState(1);
  const [items, setItems] = useState<CommunityActivityItem[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const timeZone = communityDeviceTimeZone();
  const now = new Date();

  const load = useCallback(async () => {
    if (!groupId || !supabase) {
      setState("error");
      return;
    }
    setState("loading");
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) throw new Error("unauthorized");
      if (pane === "progress") {
        const body = await fetchCrewProgress({
          accessToken: auth.session.access_token,
          groupId,
          week,
        });
        setProgress(body.progress);
        setMemberCount(body.progress.memberCount);
      } else if (pane === "highlights") {
        const body = await fetchCrewHighlights({
          accessToken: auth.session.access_token,
          groupId,
          week,
        });
        setHighlights(body.highlights);
        setMemberCount(body.memberCount);
      } else {
        const body = await fetchCrewActivity({
          accessToken: auth.session.access_token,
          groupId,
        });
        setItems(body.activity.items);
      }
      setState("ready");
    } catch {
      setState("error");
    }
  }, [groupId, pane, week]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (pane === "progress") {
    return (
      <CrewProgressView
        compactTitle={compactTitle}
        onRetry={() => void load()}
        progress={progress}
        state={state}
      />
    );
  }
  if (pane === "highlights") {
    return (
      <CrewHighlightsView
        compactTitle={compactTitle}
        crewSize={memberCount}
        highlights={highlights}
        onChangeWeek={setWeek}
        onOpenPost={onOpenPost}
        onRetry={() => void load()}
        state={state}
        week={week}
      />
    );
  }
  return (
    <CrewActivityView
      compactTitle={compactTitle}
      items={items}
      now={now}
      onOpenItem={(item) => onOpenPost?.({ postId: item.postId, sessionId: item.sessionId })}
      onRetry={() => void load()}
      state={state}
      timeZone={timeZone}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: spacing.huge,
    paddingHorizontal: spacing.xxl,
  },
  title: { color: colors.ink, flex: 1, ...type.heading },
  body: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
});
