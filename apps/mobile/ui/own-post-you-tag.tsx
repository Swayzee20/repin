import { Text, View } from "react-native";

import {
  ownPostYouTagLabel,
  ownPostYouTagStyle,
  ownPostYouTagTextStyle,
} from "./community-feed-layout";

export function OwnPostYouTag() {
  return (
    <View style={ownPostYouTagStyle()}>
      <Text style={ownPostYouTagTextStyle()}>{ownPostYouTagLabel}</Text>
    </View>
  );
}
