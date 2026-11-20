import { Text, type StyleProp, type TextStyle } from "react-native";

import { colors, fonts, type } from "./theme";

/**
 * Sentence-case section labels (Highlights, Activity, This week, Coming up).
 * Reuses the eyebrow/label size (13) with Nunito Bold and brand, not the
 * larger type.section step and not the tracked uppercase eyebrow.
 */
export const sectionLabelStyle: TextStyle = {
  color: colors.brand,
  fontFamily: fonts.bold,
  fontSize: type.eyebrow.fontSize,
  letterSpacing: 0,
  lineHeight: type.eyebrow.lineHeight,
  textAlign: "left",
};

export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text accessibilityRole="header" style={[sectionLabelStyle, style]}>
      {children}
    </Text>
  );
}
