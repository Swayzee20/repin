ALTER TABLE "groups" ADD COLUMN "invite_code" text;--> statement-breakpoint
UPDATE "groups"
SET "invite_code" = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "invite_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code");
