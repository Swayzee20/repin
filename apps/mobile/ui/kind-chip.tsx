import { Text, View } from "react-native";

import { kindFeedChipStyle, kindFeedChipTextStyle } from "./community-feed-layout";

export function KindChip({ label }: { label: string }) {
  return (
    <View pointerEvents="none" style={kindFeedChipStyle()}>
      <Text style={kindFeedChipTextStyle()}>{label}</Text>
    </View>
  );
}
