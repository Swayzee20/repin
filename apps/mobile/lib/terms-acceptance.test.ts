import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { colors, fonts, size, spacing, type } from "../ui/theme";
import {
  GUIDELINES_LINK_LABEL,
  GUIDELINES_URL,
  SIGNUP_AGREE_COPY,
  TERMS_LINK_LABEL,
  TERMS_URL,
  TERMS_VERSION,
  agreeLineLinkPressedText,
  agreeLineLinkText,
  agreeLineSubmitGap,
  agreeLineText,
  agreeLinkHitSlop,
  signupAuthMetadata,
  termsAcceptanceMetadata,
  termsAcceptanceSlot,
} from "./terms-acceptance";

test("placeholder legal URLs are marked for later swap", () => {
  assert.equal(TERMS_URL, "https://repin.app/terms");
  assert.equal(GUIDELINES_URL, "https://repin.app/guidelines");
  const source = readFileSync(new URL("./terms-acceptance.ts", import.meta.url), "utf8");
  assert.match(source, /PLACEHOLDER/);
  assert.match(source, /TODO: replace TERMS_URL and GUIDELINES_URL/);
});

test("terms version is the Feb 10 2027 submission date", () => {
  assert.equal(TERMS_VERSION, "2027-02-10");
});

test("sign-up metadata records the version and an ISO timestamp", () => {
  const acceptedAt = new Date("2026-11-04T12:00:00.000Z");
  assert.deepEqual(termsAcceptanceMetadata(acceptedAt), {
    terms_accepted_at: "2026-11-04T12:00:00.000Z",
    terms_version: "2027-02-10",
  });
});

test("auth sign-up data includes name fields plus terms acceptance", () => {
  const acceptedAt = new Date("2026-11-04T12:00:00.000Z");
  assert.deepEqual(
    signupAuthMetadata({
      acceptedAt,
      firstName: "Josue",
      lastName: "Flores",
    }),
    {
      display_name: "Josue Flores",
      first_name: "Josue",
      full_name: "Josue Flores",
      last_name: "Flores",
      terms_accepted_at: "2026-11-04T12:00:00.000Z",
      terms_version: "2027-02-10",
    },
  );
});

test("agree-line copy and link labels match the spec", () => {
  assert.equal(
    SIGNUP_AGREE_COPY,
    "By creating an account, you agree to repin's Terms of Service and Community Guidelines.",
  );
  assert.equal(TERMS_LINK_LABEL, "Terms of Service, opens in browser");
  assert.equal(GUIDELINES_LINK_LABEL, "Community Guidelines, opens in browser");
  assert.equal(termsAcceptanceSlot, "signup-before-create-account");
});

test("agree-line type is bodySmall 14 Regular muted", () => {
  assert.equal(agreeLineText.color, colors.muted);
  assert.equal(agreeLineText.fontFamily, fonts.regular);
  assert.equal(agreeLineText.fontSize, type.bodySmall.fontSize);
  assert.equal(agreeLineText.lineHeight, type.bodySmall.lineHeight);
  assert.equal(agreeLineText.fontSize, 14);
  assert.equal(agreeLineText.lineHeight, 20);
});

test("agree-line links are brand, weight 700, and underlined", () => {
  assert.equal(agreeLineLinkText.color, colors.brand);
  assert.equal(agreeLineLinkText.fontFamily, fonts.bold);
  assert.equal(agreeLineLinkText.textDecorationLine, "underline");
  assert.equal(agreeLineLinkPressedText.color, colors.brandPressed);
});

test("each agree-line link expands to a 44pt hit target", () => {
  assert.equal(agreeLinkHitSlop, spacing.md);
  assert.equal(type.bodySmall.lineHeight + agreeLinkHitSlop * 2, size.hit);
});

test("Create Account sits spacing.md below the agree line", () => {
  assert.equal(agreeLineSubmitGap, spacing.md);
});
