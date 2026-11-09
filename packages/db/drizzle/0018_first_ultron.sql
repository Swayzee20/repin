CREATE TABLE "community_post_prs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"metric_load_kg" numeric(12, 3),
	"metric_duration_seconds" integer,
	"metric_rounds" integer,
	"metric_reps" integer,
	"metric_finished" boolean,
	"display_label" text NOT NULL,
	"display_value" text NOT NULL,
	"source_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_prs_kind_check" CHECK ("community_post_prs"."kind" in ('heaviest_single', 'distance_time', 'amrap', 'for_time')),
	CONSTRAINT "community_post_prs_key_check" CHECK (length(btrim("community_post_prs"."key")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"metric_load_kg" numeric(12, 3),
	"metric_duration_seconds" integer,
	"metric_rounds" integer,
	"metric_reps" integer,
	"metric_finished" boolean,
	"display_unit" text,
	"display_label" text NOT NULL,
	"display_value" text NOT NULL,
	"source" text NOT NULL,
	"baseline_only" boolean DEFAULT false NOT NULL,
	"celebrated" boolean DEFAULT false NOT NULL,
	"source_session_id" uuid,
	"source_set_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_records_kind_check" CHECK ("personal_records"."kind" in ('heaviest_single', 'distance_time', 'amrap', 'for_time')),
	CONSTRAINT "personal_records_source_check" CHECK ("personal_records"."source" in ('logged', 'backfill')),
	CONSTRAINT "personal_records_key_check" CHECK (length(btrim("personal_records"."key")) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "community_post_prs" ADD CONSTRAINT "community_post_prs_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_prs" ADD CONSTRAINT "community_post_prs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_prs" ADD CONSTRAINT "community_post_prs_source_session_id_workout_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_source_session_id_workout_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_source_set_id_set_results_id_fk" FOREIGN KEY ("source_set_id") REFERENCES "public"."set_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_prs_post_kind_key_unique" ON "community_post_prs" USING btree ("post_id","kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_prs_user_kind_key_unique" ON "community_post_prs" USING btree ("user_id","kind","key");--> statement-breakpoint
CREATE INDEX "community_post_prs_post_id_idx" ON "community_post_prs" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_records_user_kind_key_unique" ON "personal_records" USING btree ("user_id","kind","key");--> statement-breakpoint
CREATE INDEX "personal_records_user_id_idx" ON "personal_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_records_source_session_id_idx" ON "personal_records" USING btree ("source_session_id");