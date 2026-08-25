CREATE TABLE "community_post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_reactions_type_check" CHECK ("community_post_reactions"."reaction_type" in ('fire', 'strong', 'clap'))
);
--> statement-breakpoint
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_community_post_id_community_posts_id_fk" FOREIGN KEY ("community_post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_reactions_post_user_unique" ON "community_post_reactions" USING btree ("community_post_id","user_id");--> statement-breakpoint
CREATE INDEX "community_post_reactions_user_id_idx" ON "community_post_reactions" USING btree ("user_id");