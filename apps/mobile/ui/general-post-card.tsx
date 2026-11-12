import {
  getUserInitials,
  resolveUserDisplayName,
  type GeneralPostFeedItem,
} from "@repin/types";
import { generalPostCopy } from "@repin/validation";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { ContentMenuItem } from "../lib/content-menu";
import { formatPostTimestamp } from "../lib/workout-date";
import { isOwnPost, ownPostMarkerStyle, ownPostVoiceOverLabel } from "./community-feed-layout";
import { Card, ContentOptionsMenu } from "./components";
import { GeneralPostBody } from "./general-post-body";
import { GeneralPostPhotoGrid } from "./general-post-photos";
import { Icon } from "./icons";
import { colors, fonts, radii, size, spacing, type } from "./theme";

export function GeneralPostSummaryCard({
  isPinned = false,
  menuItems = [],
  selected = false,
  showCommentCount = false,
  showReactionSummary = false,
  style,
  post,
  viewerUserId,
}: {
  isPinned?: boolean;
  menuItems?: ContentMenuItem[];
  selected?: boolean;
  showCommentCount?: boolean;
  showReactionSummary?: boolean;
  style?: StyleProp<ViewStyle>;
  post: GeneralPostFeedItem;
  viewerUserId?: string | null;
}) {
  const isOwn = isOwnPost(post.userId, viewerUserId);
  const displayName = resolveUserDisplayName({ displayName: post.displayName });
  const reactionSummary = showReactionSummary && post.reactionCounts
    ? ([
        ["🔥", post.reactionCounts.fire],
        ["💪", post.reactionCounts.strong],
        ["👏", post.reactionCounts.clap],
      ] as const).filter(([, value]) => value > 0)
    : [];
  const reactionTotal = reactionSummary.reduce((sum, [, value]) => sum + value, 0);
  const socialSummary = [
    ...(reactionSummary.length
      ? [{ accessibility: `${reactionTotal} reaction${reactionTotal === 1 ? "" : "s"}`, text: reactionSummary.map(([emoji, value]) => `${emoji} ${value}`).join("   ") }]
      : []),
    ...(showCommentCount && (post.commentCount ?? 0) > 0
      ? [{ accessibility: `${post.commentCount} comment${post.commentCount === 1 ? "" : "s"}`, text: `💬 ${post.commentCount}` }]
      : []),
  ];

  return (
    <View
      accessibilityLabel={isOwn ? ownPostVoiceOverLabel : undefined}
      style={styles.wrap}
    >
      {isPinned ? (
        <View style={styles.pinEyebrow}>
          <Icon color={colors.brand} name="pin" size={size.icon.sm} />
          <Text style={styles.pinLabel}>{generalPostCopy.pinEyebrow}</Text>
        </View>
      ) : null}
      <Card selected={selected} style={[styles.card, style]}>
        <View style={styles.topline}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getUserInitials({ displayName: post.displayName })}</Text>
          </View>
          <View style={styles.authorBlock}>
            <Text numberOfLines={1} style={styles.author}>{displayName}</Text>
            <Text style={styles.timestamp}>{formatPostTimestamp(post.createdAt, post.editedAt)}</Text>
          </View>
          <View style={styles.typePill}>
            <Text style={styles.typeText}>{generalPostCopy.typePill}</Text>
          </View>
          {menuItems.length ? (
            <ContentOptionsMenu
              accessibilityLabel={`Options for ${displayName}'s post`}
              items={menuItems}
            />
          ) : null}
        </View>
        <GeneralPostBody body={post.body} numberOfLines={6} />
        <GeneralPostPhotoGrid photos={post.photos} />
        {socialSummary.length ? (
          <Text
            accessibilityLabel={socialSummary.map((item) => item.accessibility).join(", ")}
            numberOfLines={1}
            style={styles.social}
          >
            {socialSummary.map((item) => item.text).join("   ")}
          </Text>
        ) : null}
      </Card>
      {isOwn ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          pointerEvents="none"
          style={[styles.ownEdge, ownPostMarkerStyle()]}
        />
      ) : null}
    </View>
  );
}

export function generalPostFeedCardLabel({ isOwn }: { isOwn: boolean }) {
  const details = "Open post details";
  return isOwn ? `${ownPostVoiceOverLabel}. ${details}` : details;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", position: "relative", width: "100%" },
  pinEyebrow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pinLabel: { color: colors.brand, ...type.eyebrow },
  card: { padding: spacing.lg },
  topline: { alignItems: "center", flexDirection: "row", marginBottom: spacing.md },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: spacing.huge - spacing.xs,
    justifyContent: "center",
    width: spacing.huge - spacing.xs,
  },
  avatarText: { color: colors.brand, fontFamily: fonts.bold, fontSize: type.label.fontSize },
  authorBlock: { flex: 1, marginLeft: spacing.md },
  author: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.bodySmall.fontSize },
  timestamp: { color: colors.muted, fontFamily: fonts.regular, fontSize: type.label.fontSize, marginTop: spacing.xs / 2 },
  typePill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typeText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: type.micro.fontSize },
  social: { color: colors.muted, fontFamily: fonts.medium, fontSize: type.label.fontSize, marginTop: spacing.md, textAlign: "right" },
  ownEdge: { bottom: 0, left: 0, position: "absolute", top: 0 },
});
