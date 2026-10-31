import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform, View } from "react-native";

import { colors, size } from "./theme";

const vectorIcons = {
  "arrow.triangle.2.circlepath": "repeat",
  bolt: "zap",
  camera: "camera",
  checkmark: "check",
  "chevron.down": "chevron-down",
  "chevron.left": "chevron-left",
  "chevron.right": "chevron-right",
  "chevron.up": "chevron-up",
  clipboard: "clipboard",
  ellipsis: "more-horizontal",
  "exclamationmark.circle": "alert-circle",
  "exclamationmark.triangle": "alert-triangle",
  house: "home",
  pencil: "edit-2",
  "person.2": "users",
  "person.crop.circle": "user",
  plus: "plus",
  trash: "trash-2",
  xmark: "x",
} as const;

export type IconName = keyof typeof vectorIcons | "flame";

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
          name={name === "flame" ? "flame.fill" : name}
          resizeMode="scaleAspectFit"
          size={iconSize}
          style={{ height: iconSize, width: iconSize }}
          tintColor={color}
          weight="medium"
        />
      ) : name === "flame" ? (
        <MaterialCommunityIcons color={color} name="fire" size={iconSize} />
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
