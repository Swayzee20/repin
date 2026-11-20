import { ringFillSweepDeg } from "@repin/validation";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import {
  ringCenterlineRadius,
  ringCircumference,
  ringFillDashLength,
  ringFillDashOffset,
  ringGapDashLength,
  ringGapDashOffset,
  ringShowsFill,
  ringShowsGap,
  ringShowsTrack,
  ringStartRotationDeg,
  ringStrokeDasharray,
} from "./progress-ring-math";
import { colors, progressRing, type } from "./theme";

export function GoalProgressRing({
  label,
  progress,
  reached,
}: {
  label: string;
  progress: number;
  reached: boolean;
}) {
  useReducedMotion();
  const size = progressRing.diameter;
  const fillStroke = progressRing.fillStroke;
  const radius = ringCenterlineRadius(size, fillStroke);
  const center = size / 2;
  const circumference = ringCircumference(radius);
  const sweep = reached ? 360 : ringFillSweepDeg(progress, progressRing.gapDeg);
  const fillDash = ringFillDashLength(sweep, circumference);
  const gapDash = ringGapDashLength(progressRing.gapDeg, circumference);
  const color = reached ? colors.success : colors.brand;
  const rotation = ringStartRotationDeg();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box}
    >
      <Svg height={size} width={size}>
        {ringShowsTrack(reached) ? (
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={colors.muted}
            strokeWidth={progressRing.trackStroke}
          />
        ) : null}
        {ringShowsFill(sweep, reached) ? (
          <Circle
            cx={center}
            cy={center}
            fill="none"
            originX={center}
            originY={center}
            r={radius}
            rotation={rotation}
            stroke={color}
            strokeDasharray={reached ? undefined : ringStrokeDasharray(fillDash, circumference)}
            strokeDashoffset={reached ? undefined : ringFillDashOffset()}
            strokeLinecap="round"
            strokeWidth={fillStroke}
          />
        ) : null}
        {ringShowsGap(sweep, reached) ? (
          <Circle
            cx={center}
            cy={center}
            fill="none"
            originX={center}
            originY={center}
            r={radius}
            rotation={rotation}
            stroke={colors.surface}
            strokeDasharray={ringStrokeDasharray(gapDash, circumference)}
            strokeDashoffset={ringGapDashOffset(fillDash)}
            strokeWidth={fillStroke}
          />
        ) : null}
      </Svg>
      <View pointerEvents="none" style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    height: progressRing.diameter,
    justifyContent: "center",
    width: progressRing.diameter,
  },
  labelWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: colors.ink,
    ...type.ringLabel,
    textAlign: "center",
  },
});
