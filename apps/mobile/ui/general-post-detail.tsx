import {
  communityReactionTypes,
  type CommunityPostComment,
  type CommunityReactionSummary,
  type CommunityReactionType,
  type GeneralPostDetail,
  type GeneralPostFeedItem,
} from "@repin/types";
import { generalPostCopy } from "@repin/validation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { CommentsSectionLabel, commentsSectionSpacing } from "./comments-section-label";
import { GeneralPostSummaryCard } from "./general-post-card";
import { Icon } from "./icons";
import { colors, radii, size, spacing, type } from "./theme";

export function GeneralPostDetailView({
  groupId,
  paneHeader = null,
  post,
  presentation = "community-pane",
}: {
  groupId: string;
  paneHeader?: ReactNode;
  post: GeneralPostFeedItem;
  presentation?: "community-modal" | "community-pane";
}) {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<GeneralPostDetail | null>(null);
  const [commentText, setCommentText] = useState("");
  const [pending, setPending] = useState(false);
  const isModal = presentation === "community-modal";

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

  const composerPaddingBottom = isModal ? spacing.lg : Math.max(insets.bottom, spacing.md);

  return (
    <View style={isModal ? styles.modalBody : styles.pane}>
      {isModal ? null : paneHeader}
      <ScrollView
        contentContainerStyle={isModal ? styles.modalScroll : styles.paneScroll}
        keyboardShouldPersistTaps="handled"
        style={isModal ? styles.modalScroller : styles.paneScroller}
      >
        <GeneralPostSummaryCard post={current} showCommentCount showReactionSummary />
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
        <View style={styles.commentsBlock}>
          <CommentsSectionLabel />
          <View style={styles.commentsAfterLabel}>
            {current.comments.length ? current.comments.map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{comment.displayName}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            )) : (
              <Text style={styles.commentEmpty}>No comments yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: composerPaddingBottom }]}>
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
  // eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size
  pane: { flex: 1, minHeight: 0 },
  // eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size
  modalBody: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  // eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size
  paneScroller: { flex: 1, minHeight: 0 },
  modalScroller: { flexGrow: 0, flexShrink: 1 },
  paneScroll: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  modalScroll: { paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  reactions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  reaction: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: size.hit,
    justifyContent: "center",
    width: size.hit,
  },
  reactionOn: { backgroundColor: colors.brandTint },
  commentsBlock: { marginTop: commentsSectionSpacing.afterPost },
  commentsAfterLabel: { marginTop: commentsSectionSpacing.beforeList },
  comment: { gap: spacing.xs },
  commentAuthor: { color: colors.brand, ...type.label },
  commentText: { color: colors.ink, ...type.body },
  commentEmpty: { color: colors.muted, ...type.bodySmall },
  composer: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
