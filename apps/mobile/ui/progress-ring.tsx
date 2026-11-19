import { ringFillSweepDeg } from "@repin/validation";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, Text, View } from "react-native";

import { ringCapPoint, ringTickOnFill, ringTickTransform } from "./progress-ring-math";
import { colors, progressRing, radii, type } from "./theme";

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
  const fill = progressRing.fillStroke;
  const color = reached ? colors.success : colors.brand;
  const sweep = ringFillSweepDeg(progress, progressRing.gapDeg);
  if (reached) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.box, { borderColor: color, borderWidth: fill }]}
      >
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  }

  const ticks = Array.from({ length: progressRing.tickCount }, (_, index) => {
    const deg = (index / progressRing.tickCount) * 360;
    const filled = ringTickOnFill(index, progressRing.tickCount, sweep);
    return (
      <View
        key={index}
        style={[
          styles.tick,
          {
            backgroundColor: filled ? color : colors.muted,
            height: filled ? fill : progressRing.trackStroke,
            transform: ringTickTransform(size, filled ? fill : progressRing.trackStroke, deg),
          },
        ]}
      />
    );
  });
  const startCap = sweep > 0 ? ringCapPoint(size, fill, 0) : null;
  const endCap = sweep > 0 ? ringCapPoint(size, fill, sweep) : null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box}
    >
      {ticks}
      {startCap ? <View style={[styles.cap, { left: startCap.x, top: startCap.y, backgroundColor: color }]} /> : null}
      {endCap ? <View style={[styles.cap, { left: endCap.x, top: endCap.y, backgroundColor: color }]} /> : null}
      <View pointerEvents="none" style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: progressRing.diameter,
    justifyContent: "center",
    width: progressRing.diameter,
  },
  tick: {
    borderRadius: radii.pill,
    left: progressRing.diameter / 2 - progressRing.gapPt / 2,
    position: "absolute",
    top: 0,
    width: progressRing.gapPt,
  },
  cap: {
    borderRadius: radii.pill,
    height: progressRing.fillStroke,
    position: "absolute",
    width: progressRing.fillStroke,
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
