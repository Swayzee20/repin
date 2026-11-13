import {
  communityReactionTypes,
  type CommunityPostComment,
  type CommunityReactionSummary,
  type CommunityReactionType,
  type GeneralPostDetail,
  type GeneralPostFeedItem,
} from "@repin/types";
import { generalPostCopy } from "@repin/validation";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createGeneralPostComment,
  fetchGeneralPostDetail,
  removeGeneralPostReaction,
  setGeneralPostReaction,
} from "../lib/general-posts-api";
import { supabase } from "../lib/supabase";
import { GeneralPostSummaryCard } from "./general-post-card";
import { Icon } from "./icons";
import { RoundIconButton } from "./primitives";
import { colors, radii, size, spacing, type } from "./theme";

export function GeneralPostDetailView({
  groupId,
  onClose,
  post,
  presentation = "modal",
  viewerUserId,
}: {
  groupId: string;
  onClose?: () => void;
  post: GeneralPostFeedItem;
  presentation?: "community-pane" | "modal";
  viewerUserId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<GeneralPostDetail | null>(null);
  const [commentText, setCommentText] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const next = await fetchGeneralPostDetail({
      accessToken: auth.session.access_token,
      groupId,
      postId: post.id,
    });
    setDetail(next);
  }, [groupId, post.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = detail ?? {
    ...post,
    comments: [] as CommunityPostComment[],
    reactions: {
      counts: post.reactionCounts ?? { fire: 0, strong: 0, clap: 0 },
      total: 0,
      viewerReaction: null,
    },
  };

  const toggleReaction = async (reactionType: CommunityReactionType) => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const reactions: CommunityReactionSummary = current.reactions.viewerReaction === reactionType
      ? await removeGeneralPostReaction({
          accessToken: auth.session.access_token,
          groupId,
          postId: post.id,
        })
      : await setGeneralPostReaction({
          accessToken: auth.session.access_token,
          groupId,
          postId: post.id,
          reactionType,
        });
    setDetail((existing) => existing ? { ...existing, reactions } : existing);
  };

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !supabase) return;
    setPending(true);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const comment = await createGeneralPostComment({
        accessToken: auth.session.access_token,
        groupId,
        postId: post.id,
        text,
      });
      setCommentText("");
      setDetail((existing) => existing
        ? { ...existing, comments: [...existing.comments, comment], commentCount: (existing.commentCount ?? 0) + 1 }
        : existing);
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.root}>
      {presentation === "modal" ? (
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <RoundIconButton accessibilityLabel="Back" kind="back" onPress={onClose ?? (() => {})} />
          <Text accessibilityRole="header" style={styles.title}>{generalPostCopy.detailTitle}</Text>
        </View>
      ) : (
        <Text accessibilityRole="header" style={styles.paneTitle}>{generalPostCopy.detailTitle}</Text>
      )}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GeneralPostSummaryCard post={current} showCommentCount showReactionSummary viewerUserId={viewerUserId} />
        <View style={styles.reactions}>
          {communityReactionTypes.map((reaction) => (
            <Pressable
              key={reaction}
              onPress={() => void toggleReaction(reaction)}
              style={[
                styles.reaction,
                current.reactions.viewerReaction === reaction && styles.reactionOn,
              ]}
            >
              <Text>{reaction === "fire" ? "🔥" : reaction === "strong" ? "💪" : "👏"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.commentsTitle}>Comments</Text>
        {current.comments.map((comment) => (
          <View key={comment.id} style={styles.comment}>
            <Text style={styles.commentAuthor}>{comment.displayName}</Text>
            <Text style={styles.commentText}>{comment.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TextInput
          onChangeText={setCommentText}
          placeholder={generalPostCopy.addComment}
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={commentText}
        />
        <Pressable
          accessibilityLabel="Send comment"
          disabled={pending || !commentText.trim()}
          onPress={() => void submitComment()}
          style={[styles.send, (!commentText.trim() || pending) && styles.sendDisabled]}
        >
          <Icon color={colors.surface} name="chevron.right" size={size.icon.md} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { color: colors.ink, flex: 1, marginLeft: spacing.md, textAlign: "center", ...type.heading },
  paneTitle: { color: colors.ink, marginBottom: spacing.lg, ...type.heading },
  content: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  reactions: { flexDirection: "row", gap: spacing.sm },
  reaction: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  reactionOn: { backgroundColor: colors.brandTint },
  commentsTitle: { color: colors.brand, ...type.eyebrow },
  comment: { gap: spacing.xs },
  commentAuthor: { color: colors.brand, ...type.label },
  commentText: { color: colors.ink, ...type.body },
  composer: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  input: {
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    color: colors.ink,
    flex: 1,
    minHeight: size.hit,
    paddingHorizontal: spacing.lg,
    ...type.body,
  },
  send: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  sendDisabled: { backgroundColor: colors.disabledFill },
});
