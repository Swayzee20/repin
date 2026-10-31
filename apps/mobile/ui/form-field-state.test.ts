import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, fonts, radii, size, spacing, type } from "./theme";
import { controlHelperGap } from "./primitive-state";
import {
  choiceText,
  choiceTileChrome,
  choiceTileHeight,
  dateRowHeight,
  dateRowLabelText,
  dateRowValueText,
  effortLabels,
  emptyFlameOpacity,
  errorText,
  fieldChrome,
  fieldLabelText,
  flameGlyphSize,
  flameTileSize,
  flameTileState,
  formSpacing,
  helperText,
  numberFieldKeyboard,
  optionalText,
  photoAddLabel,
  photoDismissChrome,
  photoTileChrome,
  photoUploadErrorMessage,
  photoUploadFieldError,
  pickerPlaceholder,
  resolveFieldInteraction,
  secondsRangeError,
  secondsRangeMessage,
  suffixText,
  textAreaHeight,
  textAreaMaxHeight,
  textAreaMinHeight,
  textFieldBorderWidth,
  textFieldEmphasisBorderWidth,
  textFieldHeight,
  textFieldPadding,
} from "./form-field-state";

test("text fields are 48pt with a 1pt border and 16pt padding", () => {
  const chrome = fieldChrome("default");
  assert.equal(textFieldHeight, 48);
  assert.equal(chrome.height, size.control);
  assert.equal(chrome.borderRadius, radii.md);
  assert.equal(chrome.borderWidth, 1);
  assert.equal(chrome.borderColor, colors.borderStrong);
  assert.equal(chrome.backgroundColor, colors.surface);
  assert.equal(chrome.color, colors.ink);
  assert.equal(chrome.paddingHorizontal, 16);
  assert.equal(chrome.placeholderColor, colors.subtle);
  assert.equal("opacity" in chrome, false);
});

test("focus and error use a 2pt border and pull padding in by 1pt", () => {
  const focus = fieldChrome("focus");
  const error = fieldChrome("error");
  const resting = fieldChrome("default");
  assert.equal(focus.borderWidth, textFieldEmphasisBorderWidth);
  assert.equal(focus.borderColor, colors.brand);
  assert.equal(error.borderColor, colors.danger);
  assert.equal(error.borderWidth, 2);
  assert.equal(focus.paddingHorizontal, textFieldPadding - 1);
  assert.equal(resting.paddingHorizontal + resting.borderWidth, focus.paddingHorizontal + focus.borderWidth);
  assert.equal(resting.paddingHorizontal + resting.borderWidth, error.paddingHorizontal + error.borderWidth);
  assert.equal(textFieldBorderWidth, 1);
});

test("disabled fields use the disabled fill and text, never opacity or brand", () => {
  const chrome = fieldChrome("disabled");
  assert.equal(chrome.backgroundColor, colors.disabledFill);
  assert.equal(chrome.borderColor, colors.disabledFill);
  assert.equal(chrome.color, colors.disabledText);
  assert.equal(chrome.placeholderColor, colors.disabledText);
  assert.notEqual(chrome.backgroundColor, colors.brand);
  assert.equal("opacity" in chrome, false);
  assert.equal(resolveFieldInteraction({ disabled: true, error: true, focused: true }), "disabled");
  assert.equal(resolveFieldInteraction({ disabled: false, error: true, focused: true }), "error");
  assert.equal(resolveFieldInteraction({ disabled: false, error: false, focused: true }), "focus");
  assert.equal(resolveFieldInteraction({ disabled: false, error: false, focused: false }), "default");
});

test("a filled value keeps the resting chrome", () => {
  assert.equal(resolveFieldInteraction({ disabled: false, error: false, focused: false }), "default");
});

test("text areas grow from 96 to 160", () => {
  assert.equal(textAreaMinHeight, 96);
  assert.equal(textAreaMaxHeight, 160);
  assert.equal(textAreaHeight(0), 96);
  assert.equal(textAreaHeight(40), 96);
  assert.equal(textAreaHeight(120.2), 121);
  assert.equal(textAreaHeight(400), 160);
  assert.equal(textAreaHeight(Number.NaN), 96);
});

test("form spacing matches the field rhythm", () => {
  assert.equal(formSpacing.labelGap, spacing.sm);
  assert.equal(formSpacing.labelGap, 8);
  assert.equal(formSpacing.helperGap, controlHelperGap);
  assert.equal(formSpacing.helperGap, 6);
  assert.equal(formSpacing.fieldGap, 16);
  assert.equal(formSpacing.groupPadding, 20);
  assert.equal(formSpacing.cardGap, 16);
  assert.equal(fieldLabelText.fontFamily, fonts.bold);
  assert.equal(fieldLabelText.fontSize, type.bodySmall.fontSize);
  assert.equal(fieldLabelText.color, colors.inkSoft);
  assert.equal(optionalText.fontFamily, fonts.medium);
  assert.equal(optionalText.fontSize, type.label.fontSize);
  assert.equal(optionalText.color, colors.muted);
  assert.equal(helperText.fontFamily, fonts.regular);
  assert.equal(helperText.color, colors.muted);
  assert.equal(errorText.fontFamily, fonts.semibold);
  assert.equal(errorText.color, colors.danger);
  assert.equal(errorText.fontSize, type.label.fontSize);
});

test("number fields use a number or decimal pad and flag seconds outside 0-59", () => {
  assert.equal(numberFieldKeyboard("number").keyboardType, "number-pad");
  assert.equal(numberFieldKeyboard("number").inputMode, "numeric");
  assert.equal(numberFieldKeyboard("decimal").keyboardType, "decimal-pad");
  assert.equal(numberFieldKeyboard("decimal").inputMode, "decimal");
  assert.equal(suffixText.color, colors.muted);
  assert.equal(suffixText.fontSize, type.bodySmall.fontSize);
  assert.equal(secondsRangeError(""), null);
  assert.equal(secondsRangeError("  "), null);
  assert.equal(secondsRangeError("0"), null);
  assert.equal(secondsRangeError("59"), null);
  assert.equal(secondsRangeError("75"), secondsRangeMessage);
  assert.equal(secondsRangeMessage, "0-59 only");
  assert.equal(secondsRangeError("60"), secondsRangeMessage);
  assert.equal(secondsRangeError("8a"), secondsRangeMessage);
  assert.equal(secondsRangeError("-1"), secondsRangeMessage);
});

test("flame rating is five 44pt tiles with a grey empty flame and a selected ring", () => {
  assert.equal(effortLabels.length, 5);
  assert.equal(flameTileSize, size.hit);
  assert.equal(flameTileSize, 44);
  assert.equal(flameGlyphSize, Math.round(44 * 0.7));
  assert.equal(emptyFlameOpacity, 0.35);
  assert.equal(effortLabels[2], "Solid work");

  const selected = flameTileState(3, 3);
  assert.equal(selected.selected, true);
  assert.equal(selected.filled, true);
  assert.equal(selected.borderColor, colors.brand);
  assert.equal(selected.borderWidth, 2);
  assert.equal(selected.color, colors.brand);
  assert.equal(selected.opacity, 1);

  const filled = flameTileState(2, 3);
  assert.equal(filled.selected, false);
  assert.equal(filled.filled, true);
  assert.equal(filled.borderColor, "transparent");

  const empty = flameTileState(4, 3);
  assert.equal(empty.filled, false);
  assert.equal(empty.color, colors.muted);
  assert.equal(empty.opacity, 0.35);

  const cleared = flameTileState(1, null);
  assert.equal(cleared.filled, false);
  assert.equal(cleared.selected, false);
});

test("choice tiles are 48pt, and selected tiles use brand tint, a 2pt brand border, and a check", () => {
  assert.equal(choiceTileHeight, 48);
  assert.equal(choiceText.fontSize, type.bodySmall.fontSize);
  const resting = choiceTileChrome({ disabled: false, selected: false });
  assert.equal(resting.backgroundColor, colors.surface);
  assert.equal(resting.borderColor, colors.borderStrong);
  assert.equal(resting.borderWidth, 1);
  assert.equal(resting.radius, radii.md);
  assert.equal(resting.showCheck, false);
  assert.equal(resting.paddingHorizontal, 16);

  const selected = choiceTileChrome({ disabled: false, selected: true });
  assert.equal(selected.backgroundColor, colors.brandTint);
  assert.equal(selected.borderColor, colors.brand);
  assert.equal(selected.borderWidth, 2);
  assert.equal(selected.showCheck, true);
  assert.equal(selected.paddingHorizontal, 15);
  assert.equal(resting.paddingHorizontal + resting.borderWidth, selected.paddingHorizontal + selected.borderWidth);

  const disabled = choiceTileChrome({ disabled: true, selected: true });
  assert.equal(disabled.backgroundColor, colors.disabledFill);
  assert.equal(disabled.color, colors.disabledText);
  assert.equal(disabled.showCheck, false);
  assert.equal("opacity" in disabled, false);
});

test("date rows match a list row with a bold 16 label and a muted value", () => {
  assert.equal(dateRowHeight, size.primary);
  assert.equal(dateRowHeight, 52);
  assert.equal(dateRowLabelText.fontSize, type.body.fontSize);
  assert.equal(dateRowLabelText.fontFamily, fonts.bold);
  assert.equal(dateRowLabelText.color, colors.ink);
  assert.equal(dateRowValueText.fontSize, type.bodySmall.fontSize);
  assert.equal(dateRowValueText.color, colors.muted);
});

test("photo tiles use a dashed card radius and a 32pt dismiss control with a 44pt hit", () => {
  assert.equal(photoTileChrome.borderStyle, "dashed");
  assert.equal(photoTileChrome.borderRadius, radii.lg);
  assert.equal(photoTileChrome.borderColor, colors.borderStrong);
  assert.equal(photoAddLabel, "Add photo");
  assert.equal(photoDismissChrome.size, 32);
  assert.equal(photoDismissChrome.hitSlop, 6);
  assert.equal(photoDismissChrome.size + photoDismissChrome.hitSlop * 2, size.hit);
  assert.equal(photoDismissChrome.backgroundColor, colors.photoFill);
  assert.equal(photoDismissChrome.borderColor, colors.photoRing);
  assert.equal(photoDismissChrome.iconColor, colors.surface);
  assert.equal(photoUploadErrorMessage, "Upload failed. Retry");
  assert.equal(photoUploadFieldError("Photo upload failed: network"), photoUploadErrorMessage);
  assert.equal(photoUploadFieldError("Choose a workout type."), null);
  assert.equal(photoUploadFieldError(null), null);
  assert.equal(pickerPlaceholder, "Choose...");
});
