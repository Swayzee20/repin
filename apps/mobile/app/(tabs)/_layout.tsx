import { NativeTabs } from "expo-router/native-tabs";

import { MainTabsGate } from "../../ui/main-tabs-gate";
import { MainTabsProvider } from "../../ui/main-tabs-context";
import { colors } from "../../ui/theme";

export default function MainTabsLayout() {
  return (
    <MainTabsProvider>
      <MainTabsGate>
        <NativeTabs
          iconColor={{ default: colors.muted, selected: colors.brand }}
          indicatorColor={colors.brand}
          labelStyle={{
            default: { color: colors.muted },
            selected: { color: colors.brand },
          }}
          preferredPlacement="tabBar"
          rippleColor={colors.surfaceMuted}
          tintColor={colors.brand}
        >
          <NativeTabs.Trigger name="(home)">
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              md={{ default: "home", selected: "home_filled" }}
              sf={{ default: "house", selected: "house.fill" }}
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="community">
            <NativeTabs.Trigger.Label>Community</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              md={{ default: "group", selected: "group" }}
              sf={{ default: "person.2", selected: "person.2.fill" }}
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              md={{ default: "account_circle", selected: "account_circle" }}
              sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
            />
          </NativeTabs.Trigger>
        </NativeTabs>
      </MainTabsGate>
    </MainTabsProvider>
  );
}
