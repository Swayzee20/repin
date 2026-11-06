CREATE TABLE "device_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "device_push_tokens_platform_check" CHECK ("device_push_tokens"."platform" in ('ios', 'android', 'web'))
);
--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "reaction_push_last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_push_tokens_expo_push_token_unique" ON "device_push_tokens" USING btree ("expo_push_token");--> statement-breakpoint
CREATE INDEX "device_push_tokens_user_id_idx" ON "device_push_tokens" USING btree ("user_id");