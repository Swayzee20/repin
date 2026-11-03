CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "content_reports_target_type_check" CHECK ("content_reports"."target_type" in ('post', 'comment')),
	CONSTRAINT "content_reports_reason_check" CHECK ("content_reports"."reason" in ('spam', 'harassment', 'hate', 'sexual', 'violence_self_harm', 'false_info', 'other')),
	CONSTRAINT "content_reports_status_check" CHECK ("content_reports"."status" in ('open', 'removed', 'dismissed')),
	CONSTRAINT "content_reports_details_check" CHECK ((
        "content_reports"."reason" <> 'other'
        and ("content_reports"."details" is null or length(btrim("content_reports"."details")) between 1 and 500)
      ) or (
        "content_reports"."reason" = 'other'
        and length(btrim("content_reports"."details")) between 1 and 500
      ))
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_distinct_check" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_reporter_target_unique" ON "content_reports" USING btree ("reporter_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "content_reports_group_status_created_idx" ON "content_reports" USING btree ("group_id","status","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_status_created_idx" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;