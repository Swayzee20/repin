import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform, View } from "react-native";

import { colors, size } from "./theme";

const vectorIcons = {
  checkmark: "check",
  "chevron.down": "chevron-down",
  "chevron.left": "chevron-left",
  "chevron.right": "chevron-right",
  "chevron.up": "chevron-up",
  house: "home",
  "person.2": "users",
  "person.crop.circle": "user",
  plus: "plus",
  xmark: "x",
} as const;

export type IconName = keyof typeof vectorIcons;

const chevrons = {
  down: "chevron.down",
  left: "chevron.left",
  right: "chevron.right",
  up: "chevron.up",
} as const satisfies Record<string, IconName>;

export function Icon({
  color = colors.ink,
  name,
  size: iconSize = size.icon.md,
}: {
  color?: string;
  name: IconName;
  size?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ height: iconSize, width: iconSize }}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name={name}
          resizeMode="scaleAspectFit"
          size={iconSize}
          style={{ height: iconSize, width: iconSize }}
          tintColor={color}
          weight="medium"
        />
      ) : (
        <Feather color={color} name={vectorIcons[name]} size={iconSize} />
      )}
    </View>
  );
}

export function Chevron({
  color = colors.muted,
  direction = "right",
  size: iconSize = size.icon.md,
}: {
  color?: string;
  direction?: keyof typeof chevrons;
  size?: number;
}) {
  return <Icon color={color} name={chevrons[direction]} size={iconSize} />;
}
