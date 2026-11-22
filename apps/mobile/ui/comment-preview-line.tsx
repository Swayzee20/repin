import type { CommunityLatestComment } from "@repin/types";
import { personFirstName, resolveUserDisplayName } from "@repin/types";
import { StyleSheet, Text } from "react-native";

import { colors, fonts, spacing, type } from "./theme";

export function CommentPreviewLine({ comment }: { comment: CommunityLatestComment }) {
  const name = personFirstName(resolveUserDisplayName({ displayName: comment.displayName }));
  return (
    <Text numberOfLines={1} style={styles.line}>
      <Text style={styles.name}>{name}</Text>
      {`  ${comment.text}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    color: colors.ink,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    marginTop: spacing.sm,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.extrabold,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
  },
});
