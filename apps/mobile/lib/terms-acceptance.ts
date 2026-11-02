/**
 * App Store guideline 1.2 requires people to agree to terms that state there
 * is zero tolerance for objectionable content or abusive users. The legal
 * copy is a separate task. Do not invent it.
 *
 * Put the acceptance control at this slot, on the sign-up form before the
 * account is created, and keep Create Account disabled until it is accepted.
 */
export const termsAcceptanceSlot = "signup-before-create-account" as const;
