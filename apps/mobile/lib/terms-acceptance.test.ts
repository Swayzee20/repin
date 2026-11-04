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
  guidelinesAgreePhrase,
  readConfiguredUrl,
  resolveAgreePhrase,
  signupAuthMetadata,
  termsAcceptanceMetadata,
  termsAcceptanceSlot,
  termsAgreePhrase,
} from "./terms-acceptance";

const termsSource = readFileSync(new URL("./terms-acceptance.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const signupSource = readFileSync(new URL("../app/signup.tsx", import.meta.url), "utf8");

test("legal URLs come from Expo public env with no hardcoded host", () => {
  assert.equal(TERMS_URL, readConfiguredUrl(process.env.EXPO_PUBLIC_TERMS_URL));
  assert.equal(GUIDELINES_URL, readConfiguredUrl(process.env.EXPO_PUBLIC_GUIDELINES_URL));
  assert.doesNotMatch(termsSource, /repin\.app/);
  assert.doesNotMatch(signupSource, /repin\.app/);
  assert.match(termsSource, /EXPO_PUBLIC_TERMS_URL/);
  assert.match(termsSource, /EXPO_PUBLIC_GUIDELINES_URL/);
});

test("unset or blank env values are not URLs", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(readConfiguredUrl(value), null);
  }
});

test("a set env value is trimmed and kept", () => {
  assert.equal(readConfiguredUrl(" https://legal.example/terms "), "https://legal.example/terms");
  assert.equal(
    readConfiguredUrl("https://legal.example/guidelines"),
    "https://legal.example/guidelines",
  );
});

test("unset phrases stay muted plain text", () => {
  assert.deepEqual(resolveAgreePhrase("Terms of Service", null, TERMS_LINK_LABEL), {
    kind: "text",
    text: "Terms of Service",
  });
  assert.deepEqual(resolveAgreePhrase("Community Guidelines", null, GUIDELINES_LINK_LABEL), {
    kind: "text",
    text: "Community Guidelines",
  });
});

test("set phrases become links with labels", () => {
  assert.deepEqual(
    resolveAgreePhrase("Terms of Service", "https://legal.example/terms", TERMS_LINK_LABEL),
    {
      kind: "link",
      label: TERMS_LINK_LABEL,
      text: "Terms of Service",
      url: "https://legal.example/terms",
    },
  );
  assert.deepEqual(
    resolveAgreePhrase(
      "Community Guidelines",
      "https://legal.example/guidelines",
      GUIDELINES_LINK_LABEL,
    ),
    {
      kind: "link",
      label: GUIDELINES_LINK_LABEL,
      text: "Community Guidelines",
      url: "https://legal.example/guidelines",
    },
  );
});

test("exported phrases follow the current env", () => {
  assert.deepEqual(termsAgreePhrase, resolveAgreePhrase("Terms of Service", TERMS_URL, TERMS_LINK_LABEL));
  assert.deepEqual(
    guidelinesAgreePhrase,
    resolveAgreePhrase("Community Guidelines", GUIDELINES_URL, GUIDELINES_LINK_LABEL),
  );
});

test("the env example lists empty legal URL vars", () => {
  assert.match(envExample, /^EXPO_PUBLIC_TERMS_URL=$/m);
  assert.match(envExample, /^EXPO_PUBLIC_GUIDELINES_URL=$/m);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_TERMS_URL=https?:/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_GUIDELINES_URL=https?:/);
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
