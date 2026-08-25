CREATE TABLE "community_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_comments_text_check" CHECK (length(btrim("community_post_comments"."text")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_community_post_id_community_posts_id_fk" FOREIGN KEY ("community_post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_post_comments_post_created_at_idx" ON "community_post_comments" USING btree ("community_post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "community_post_comments_user_id_idx" ON "community_post_comments" USING btree ("user_id");