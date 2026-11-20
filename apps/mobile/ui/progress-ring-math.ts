/** SVG Goal progress ring geometry. Centerline radius is (diameter − fill stroke) / 2. */

export function ringCenterlineRadius(diameter: number, fillStroke: number) {
  return (diameter - fillStroke) / 2;
}

export function ringCircumference(radius: number) {
  return 2 * Math.PI * radius;
}

/** SVG circles start at 3 o'clock; −90° puts 0° at 12 o'clock, clockwise. */
export function ringStartRotationDeg() {
  return -90;
}

export function ringFillDashLength(sweepDeg: number, circumference: number) {
  if (sweepDeg <= 0) return 0;
  if (sweepDeg >= 360) return circumference;
  return (sweepDeg / 360) * circumference;
}

export function ringFillDashOffset() {
  return 0;
}

export function ringGapDashLength(gapDeg: number, circumference: number) {
  return (Math.min(360, Math.max(0, gapDeg)) / 360) * circumference;
}

/** Place the surface gap just after the fill so brand and muted do not butt. */
export function ringGapDashOffset(fillDashLength: number) {
  return -fillDashLength;
}

export function ringStrokeDasharray(dashLength: number, circumference: number) {
  return `${dashLength} ${circumference}`;
}

export function ringShowsTrack(reached: boolean) {
  return !reached;
}

export function ringShowsFill(sweepDeg: number, reached: boolean) {
  return reached || sweepDeg > 0;
}

export function ringShowsGap(sweepDeg: number, reached: boolean) {
  return !reached && sweepDeg > 0 && sweepDeg < 360;
}
