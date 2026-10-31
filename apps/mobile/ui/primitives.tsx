import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron, Icon } from "./icons";
import {
  isSegmentSelected,
  nextSegmentValue,
  roundIconChrome,
  roundIconDiameter,
  roundIconIconSize,
  roundIconLabel,
  segmentTextColor,
  segmentThumbColor,
  segmentedMetrics,
  type RoundIconKind,
  type RoundIconLook,
  type SegmentedSize,
} from "./primitive-state";
import { colors, elevation, fonts, radii, size, spacing, type } from "./theme";

export const roundNavButtonStyle: ViewStyle = {
  marginBottom: spacing.xl,
};

export function RoundIconButton({
  accessibilityLabel,
  kind,
  look = "glass",
  onPress,
  style,
}: {
  accessibilityLabel?: string;
  kind: RoundIconKind;
  look?: RoundIconLook;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const label = accessibilityLabel ?? roundIconLabel(kind);
  const icon = roundIconChrome({ kind, look, pressed: false });
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const chrome = roundIconChrome({ kind, look, pressed: state.pressed });
        return [
          styles.roundButton,
          {
            backgroundColor: chrome.backgroundColor,
            borderColor: chrome.borderColor,
            borderWidth: chrome.borderWidth,
            boxShadow: chrome.boxShadow,
          },
          webFocusRing(pressableFocused(state)),
          style,
        ];
      }}
    >
      <Icon color={icon.iconColor} name={icon.iconName} size={roundIconIconSize} />
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  accessibilityLabel,
  allowClear = false,
  disabled = false,
  onChange,
  options,
  size: controlSize = "md",
  style,
  value,
}: {
  accessibilityLabel: string;
  allowClear?: boolean;
  disabled?: boolean;
  onChange: (value: T | null) => void;
  options: readonly { label: string; value: T }[];
  size?: SegmentedSize;
  style?: StyleProp<ViewStyle>;
  value: T | null;
}) {
  const metrics = segmentedMetrics(controlSize);
  const textStyle = controlSize === "sm" ? styles.segmentTextSm : styles.segmentText;
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      style={[
        styles.segmentTrack,
        {
          backgroundColor: disabled ? colors.disabledFill : colors.glassFill,
          height: metrics.track,
        },
        disabled ? null : styles.segmentShadow,
        style,
      ]}
    >
      {options.map((option, index) => {
        const selected = isSegmentSelected(value, option.value);
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            hitSlop={metrics.hitSlop || undefined}
            key={option.value}
            onPress={() => onChange(nextSegmentValue(value, option.value, allowClear))}
            style={(state) => [
              styles.segmentOption,
              {
                paddingLeft: index === 0 ? metrics.inset : 0,
                paddingRight: index === options.length - 1 ? metrics.inset : 0,
                paddingVertical: metrics.inset,
              },
              webFocusRing(pressableFocused(state)),
            ]}
          >
            {(state) => (
              <View
                style={[
                  styles.segmentThumb,
                  {
                    backgroundColor: segmentThumbColor(selected, state.pressed, disabled),
                    height: metrics.thumb,
                  },
                ]}
              >
                <Text style={[textStyle, { color: segmentTextColor(selected, disabled) }]}>{option.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.segmentEdge, { borderColor: disabled ? colors.disabledFill : colors.glassEdge }]}
      />
    </View>
  );
}

export function ListRow({
  label,
  leading,
  onPress,
  value,
}: {
  label: string;
  leading?: ReactNode;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [
        styles.listRow,
        state.pressed && styles.listRowPressed,
        webFocusRing(pressableFocused(state)),
      ]}
    >
      {leading ? <View style={styles.listLeading}>{leading}</View> : null}
      <Text style={styles.listLabel}>{label}</Text>
      <View style={styles.listTrailing}>
        {value ? <Text style={styles.listValue}>{value}</Text> : null}
        <Chevron />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  roundButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    height: roundIconDiameter,
    justifyContent: "center",
    width: roundIconDiameter,
  },
  segmentTrack: {
    alignItems: "stretch",
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    flexDirection: "row",
    position: "relative",
  },
  segmentShadow: {
    boxShadow: elevation.glass,
  },
  segmentOption: {
    justifyContent: "center",
    minWidth: size.hit,
  },
  segmentThumb: {
    alignItems: "center",
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  segmentText: {
    ...type.body,
    fontFamily: fonts.semibold,
  },
  segmentTextSm: {
    ...type.label,
  },
  segmentEdge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: size.primary,
    paddingHorizontal: spacing.lg,
  },
  listRowPressed: {
    backgroundColor: colors.selection,
  },
  listLeading: {
    flexShrink: 0,
  },
  listLabel: {
    ...type.body,
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.semibold,
  },
  listTrailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  listValue: {
    ...type.bodySmall,
    color: colors.muted,
  },
});
