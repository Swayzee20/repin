import { Stack } from "expo-router";
import { Platform } from "react-native";

import { CommunityContextScreen } from "../../../ui/community-context-screen";
import { pushedHeaderScreenOptions, pushedNativeHeaderEnabled } from "../../../ui/pushed-header";

export default function CommunityActivityRoute() {
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  return (
    <>
      {nativeHeader ? (
        <Stack.Screen options={{ ...pushedHeaderScreenOptions(), headerTitle: "Activity", title: "Activity" }} />
      ) : null}
      <CommunityContextScreen pane="activity" />
    </>
  );
}
