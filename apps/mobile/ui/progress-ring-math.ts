import { progressRing } from "./theme";

export function ringTickOnFill(index: number, tickCount: number, sweepDeg: number) {
  if (sweepDeg <= 0) return false;
  if (sweepDeg >= 360) return true;
  const deg = (index / tickCount) * 360;
  return deg <= sweepDeg;
}

export function ringCapPoint(diameter: number, stroke: number, deg: number) {
  const radius = (diameter - stroke) / 2;
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: diameter / 2 + radius * Math.cos(rad) - stroke / 2,
    y: diameter / 2 + radius * Math.sin(rad) - stroke / 2,
  };
}

export function ringTickTransform(diameter: number, stroke: number, deg: number) {
  const offset = diameter / 2 - stroke / 2;
  return [
    { translateY: offset },
    { rotate: `${deg}deg` },
    { translateY: -offset },
  ];
}

export const ringTickCount = progressRing.tickCount;
