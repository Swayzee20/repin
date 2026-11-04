import { colors, fonts, size, spacing, type } from "../ui/theme";

/**
 * App Store guideline 1.2: people must agree to terms that state there is
 * zero tolerance for objectionable content or abusive users. Creating an
 * account is the acceptance (passive line, no checkbox).
 *
 * Legal page URLs come from Expo public env only — EAS for native builds,
 * Vercel repin-web for web. There is no default host. Leave the vars empty
 * until Josue publishes pages on a domain we own.
 */
export function readConfiguredUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const TERMS_URL = readConfiguredUrl(process.env.EXPO_PUBLIC_TERMS_URL);
export const GUIDELINES_URL = readConfiguredUrl(process.env.EXPO_PUBLIC_GUIDELINES_URL);

export const TERMS_VERSION = "2027-02-10";

export const termsAcceptanceSlot = "signup-before-create-account" as const;

export const SIGNUP_AGREE_COPY =
  "By creating an account, you agree to repin's Terms of Service and Community Guidelines.";

export const TERMS_LINK_LABEL = "Terms of Service, opens in browser";
export const GUIDELINES_LINK_LABEL = "Community Guidelines, opens in browser";

/** bodySmall 14 Regular muted; lineHeight 20 keeps the two links from stacking tight. */
export const agreeLineText = {
  color: colors.muted,
  ...type.bodySmall,
} as const;

/** Brand, weight 700, underlined — colour is not the only link cue. */
export const agreeLineLinkText = {
  color: colors.brand,
  fontFamily: fonts.bold,
  textDecorationLine: "underline" as const,
} as const;

export const agreeLineLinkPressedText = {
  color: colors.brandPressed,
} as const;

/** spacing.md between the agree line and Create Account (form gap above stays lg). */
export const agreeLineSubmitGap = spacing.md;

/**
 * Inline link visual height is bodySmall lineHeight (20). Pad each side so
 * the Pressable hit target is size.hit (44).
 */
export const agreeLinkHitSlop = (size.hit - type.bodySmall.lineHeight) / 2;

export type AgreePhrase =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; url: string; label: string };

export function resolveAgreePhrase(text: string, url: string | null, label: string): AgreePhrase {
  if (url) return { kind: "link", text, url, label };
  return { kind: "text", text };
}

export const termsAgreePhrase = resolveAgreePhrase("Terms of Service", TERMS_URL, TERMS_LINK_LABEL);
export const guidelinesAgreePhrase = resolveAgreePhrase(
  "Community Guidelines",
  GUIDELINES_URL,
  GUIDELINES_LINK_LABEL,
);

export function termsAcceptanceMetadata(acceptedAt = new Date()) {
  return {
    terms_accepted_at: acceptedAt.toISOString(),
    terms_version: TERMS_VERSION,
  };
}

export function signupAuthMetadata(input: {
  firstName: string;
  lastName: string;
  acceptedAt?: Date;
}) {
  const displayName = `${input.firstName} ${input.lastName}`;
  return {
    display_name: displayName,
    first_name: input.firstName,
    full_name: displayName,
    last_name: input.lastName,
    ...termsAcceptanceMetadata(input.acceptedAt),
  };
}
