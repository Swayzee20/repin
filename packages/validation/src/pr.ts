import { personalRecordKinds } from "@repin/types";
import { z } from "zod";

export const personalRecordKindSchema = z.enum(personalRecordKinds);

export const prKeySchema = z.string().trim().min(1).max(4_000);

export const answerPrPromptsSchema = z.object({
  answers: z.array(z.object({
    confirmed: z.boolean(),
    key: prKeySchema,
    kind: personalRecordKindSchema,
  }).strict()).min(1).max(20),
}).strict();

export const shareSessionPrsSchema = z.object({
  keys: z.array(z.object({
    key: prKeySchema,
    kind: personalRecordKindSchema,
  }).strict()).max(20).optional(),
}).strict();

export const restorePrBadgesSchema = z.object({
  badges: z.array(z.object({
    key: prKeySchema,
    kind: personalRecordKindSchema,
  }).strict()).min(1).max(20),
}).strict();
