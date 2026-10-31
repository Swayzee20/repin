import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, elevation } from "./theme";
import {
  buttonAppearance,
  buttonShowsDisabledReason,
  isSegmentSelected,
  nextSegmentValue,
  roundIconChrome,
  roundIconDiameter,
  roundIconIconSize,
  roundIconLabel,
  segmentTextColor,
  segmentedMetrics,
} from "./primitive-state";

test("disabled buttons use the disabled fill and text, never the brand color", () => {
  const disabled = buttonAppearance({ disabled: true, loading: false, pressed: true, variant: "primary" });
  assert.equal(disabled.backgroundColor, colors.disabledFill);
  assert.equal(disabled.color, colors.disabledText);
  assert.equal(disabled.showSpinner, false);
  assert.equal("opacity" in disabled, false);
  assert.notEqual(disabled.backgroundColor, colors.brand);
  assert.notEqual(disabled.backgroundColor, colors.brandPressed);

  const danger = buttonAppearance({ disabled: true, loading: false, pressed: false, variant: "danger" });
  assert.equal(danger.backgroundColor, colors.disabledFill);
  assert.equal(danger.color, colors.disabledText);
});

test("a disabled reason is visible only while the button is disabled and not loading", () => {
  assert.equal(buttonShowsDisabledReason(true, false, "Enter your email."), true);
  assert.equal(buttonShowsDisabledReason(true, true, "Enter your email."), false);
  assert.equal(buttonShowsDisabledReason(false, false, "Enter your email."), false);
  assert.equal(buttonShowsDisabledReason(true, false, undefined), false);
  assert.equal(buttonShowsDisabledReason(true, false, ""), false);
});

test("loading keeps the variant color and shows a spinner", () => {
  const loading = buttonAppearance({ disabled: true, loading: true, pressed: false, variant: "primary" });
  assert.equal(loading.backgroundColor, colors.brand);
  assert.equal(loading.color, colors.surface);
  assert.equal(loading.showSpinner, true);
  assert.equal(loading.height, 52);
});

test("primary, secondary, tonal, and danger buttons follow the variant spec", () => {
  const primary = buttonAppearance({ disabled: false, loading: false, pressed: false, variant: "primary" });
  assert.equal(primary.backgroundColor, colors.brand);
  assert.equal(primary.height, 52);
  assert.equal(buttonAppearance({ disabled: false, loading: false, pressed: true, variant: "primary" }).backgroundColor, colors.brandPressed);

  const secondary = buttonAppearance({ disabled: false, loading: false, pressed: false, variant: "secondary" });
  assert.equal(secondary.backgroundColor, colors.surface);
  assert.equal(secondary.borderColor, colors.borderStrong);
  assert.equal(secondary.borderWidth, 1);
  assert.equal(secondary.color, colors.ink);
  assert.equal(secondary.height, 52);

  const tonal = buttonAppearance({ disabled: false, loading: false, pressed: false, variant: "tonal" });
  assert.equal(tonal.backgroundColor, colors.brandTint);
  assert.equal(tonal.color, colors.brand);
  assert.equal(tonal.height, 44);

  const danger = buttonAppearance({ disabled: false, loading: false, pressed: false, variant: "danger" });
  assert.equal(danger.backgroundColor, colors.danger);
  assert.equal(danger.color, colors.surface);
});

test("segmented selection changes value and can clear", () => {
  assert.equal(nextSegmentValue("distance", "tempo", false), "tempo");
  assert.equal(nextSegmentValue("tempo", "tempo", false), "tempo");
  assert.equal(nextSegmentValue("tempo", "tempo", true), null);
  assert.equal(nextSegmentValue(null, "rounds", true), "rounds");
  assert.equal(isSegmentSelected("km", "km"), true);
  assert.equal(isSegmentSelected("km", "mi"), false);
  assert.equal(isSegmentSelected(null, "mi"), false);
});

test("segmented tracks are 48pt, or 36pt with hit slop that reaches 44", () => {
  const md = segmentedMetrics("md");
  assert.equal(md.track, 48);
  assert.equal(md.inset, 4);
  assert.equal(md.hitSlop, 0);
  assert.equal(md.thumb, 40);

  const sm = segmentedMetrics("sm");
  assert.equal(sm.track, 36);
  assert.equal(sm.inset, 4);
  assert.equal(sm.hitSlop, 4);
  assert.equal(sm.track + sm.hitSlop * 2, 44);

  assert.equal(segmentTextColor(true, false), colors.brand);
  assert.equal(segmentTextColor(false, false), colors.ink);
  assert.equal(segmentTextColor(true, true), colors.disabledText);
});

test("round icon buttons are 44pt with glass, photo, and plus chrome", () => {
  assert.equal(roundIconDiameter, 44);
  assert.equal(roundIconIconSize, 20);
  assert.equal(roundIconLabel("back"), "Back");
  assert.equal(roundIconLabel("close"), "Close");
  assert.equal(roundIconLabel("plus"), "Add");

  const glass = roundIconChrome({ kind: "back", look: "glass", pressed: false });
  assert.equal(glass.backgroundColor, colors.glassFill);
  assert.equal(glass.borderColor, colors.glassEdge);
  assert.equal(glass.borderWidth, 1);
  assert.equal(glass.boxShadow, elevation.glass);
  assert.equal(glass.iconColor, colors.ink);
  assert.equal(glass.iconName, "chevron.left");
  assert.equal(roundIconChrome({ kind: "back", look: "glass", pressed: true }).backgroundColor, colors.selection);

  const photo = roundIconChrome({ kind: "close", look: "photo", pressed: false });
  assert.equal(photo.backgroundColor, colors.photoFill);
  assert.equal(photo.borderColor, colors.photoRing);
  assert.equal(photo.iconName, "xmark");
  assert.equal(photo.boxShadow, undefined);

  const plus = roundIconChrome({ kind: "plus", look: "glass", pressed: false });
  assert.equal(plus.backgroundColor, colors.brand);
  assert.equal(plus.iconColor, colors.surface);
  assert.equal(plus.iconName, "plus");
  assert.equal(roundIconChrome({ kind: "plus", look: "glass", pressed: true }).backgroundColor, colors.brandPressed);
});
