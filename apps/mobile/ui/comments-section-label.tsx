import { Text, type TextStyle } from "react-native";

import { colors, fonts, spacing, type } from "./theme";

/** Sentence-case Comments eyebrow shared by workout and general post detail (J13). */
export const commentsSectionLabelCopy = "Comments";

export const commentsSectionLabelStyle: TextStyle = {
  color: colors.brandPressed,
  fontFamily: fonts.extrabold,
  fontSize: type.label.fontSize,
  letterSpacing: 0,
  lineHeight: type.label.lineHeight,
};

export const commentsSectionSpacing = {
  afterPost: spacing.lg,
  beforeList: spacing.xl,
} as const;

export function CommentsSectionLabel() {
  return (
    <Text accessibilityRole="header" style={commentsSectionLabelStyle}>
      {commentsSectionLabelCopy}
    </Text>
  );
}
