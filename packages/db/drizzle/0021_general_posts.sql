CREATE TABLE "content_report_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"media_paths" text[] DEFAULT '{}' NOT NULL,
	"author_erased_at" timestamp with time zone,
	"retain_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_report_evidence_target_type_check" CHECK ("content_report_evidence"."target_type" in ('post', 'comment'))
);
--> statement-breakpoint
ALTER TABLE "content_report_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crew_pinned_posts" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"pinned_by" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crew_pinned_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "general_publication_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer NOT NULL,
	"preview_title" text,
	"preview_description" text,
	"preview_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_publication_links_position_check" CHECK ("general_publication_links"."position" >= 0),
	CONSTRAINT "general_publication_links_url_check" CHECK (length(btrim("general_publication_links"."url")) between 1 and 2048)
);
--> statement-breakpoint
ALTER TABLE "general_publication_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "general_publication_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"sort_order" integer NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_publication_photos_sort_check" CHECK ("general_publication_photos"."sort_order" between 0 and 5),
	CONSTRAINT "general_publication_photos_size_check" CHECK ("general_publication_photos"."byte_size" > 0 and "general_publication_photos"."byte_size" <= 10485760),
	CONSTRAINT "general_publication_photos_type_check" CHECK ("general_publication_photos"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'))
);
--> statement-breakpoint
ALTER TABLE "general_publication_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "general_publication_upload_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	CONSTRAINT "general_publication_upload_reservations_status_check" CHECK ("general_publication_upload_reservations"."status" in ('reserved', 'uploaded', 'failed', 'consumed', 'expired')),
	CONSTRAINT "general_publication_upload_reservations_size_check" CHECK ("general_publication_upload_reservations"."byte_size" > 0 and "general_publication_upload_reservations"."byte_size" <= 10485760),
	CONSTRAINT "general_publication_upload_reservations_type_check" CHECK ("general_publication_upload_reservations"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'))
);
--> statement-breakpoint
ALTER TABLE "general_publication_upload_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "general_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_publications_body_check" CHECK ("general_publications"."body" is null or length("general_publications"."body") <= 2000),
	CONSTRAINT "general_publications_revision_check" CHECK ("general_publications"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "general_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_notification_dedupe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"alert_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_dedupe_alert_type_check" CHECK ("push_notification_dedupe"."alert_type" in ('crew_workout', 'crew_comment', 'crew_reaction', 'crew_post')),
	CONSTRAINT "push_notification_dedupe_event_key_check" CHECK (length(btrim("push_notification_dedupe"."event_key")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "push_notification_dedupe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crew_notification_prefs" DROP CONSTRAINT "crew_notification_prefs_alert_type_check";--> statement-breakpoint
ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_target_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "community_posts_group_session_unique";--> statement-breakpoint
ALTER TABLE "community_posts" ALTER COLUMN "workout_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_reports" ALTER COLUMN "target_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "kind" text DEFAULT 'workout' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "publication_id" uuid;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD COLUMN "supports_post_targets" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_id_group_unique" ON "community_posts" USING btree ("id","group_id");--> statement-breakpoint
ALTER TABLE "content_report_evidence" ADD CONSTRAINT "content_report_evidence_report_id_content_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."content_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report_evidence" ADD CONSTRAINT "content_report_evidence_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_pinned_posts" ADD CONSTRAINT "crew_pinned_posts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_pinned_posts" ADD CONSTRAINT "crew_pinned_posts_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_pinned_posts" ADD CONSTRAINT "crew_pinned_posts_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_pinned_posts" ADD CONSTRAINT "crew_pinned_posts_post_same_crew_fk" FOREIGN KEY ("post_id","group_id") REFERENCES "public"."community_posts"("id","group_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_publication_links" ADD CONSTRAINT "general_publication_links_publication_id_general_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."general_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_publication_photos" ADD CONSTRAINT "general_publication_photos_publication_id_general_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."general_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_publication_upload_reservations" ADD CONSTRAINT "general_publication_upload_reservations_publication_id_general_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."general_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_publication_upload_reservations" ADD CONSTRAINT "general_publication_upload_reservations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_publications" ADD CONSTRAINT "general_publications_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_dedupe" ADD CONSTRAINT "push_notification_dedupe_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_evidence_report_unique" ON "content_report_evidence" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "content_report_evidence_retain_until_idx" ON "content_report_evidence" USING btree ("retain_until");--> statement-breakpoint
CREATE INDEX "content_report_evidence_target_idx" ON "content_report_evidence" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "crew_pinned_posts_post_id_idx" ON "crew_pinned_posts" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "general_publication_links_publication_position_unique" ON "general_publication_links" USING btree ("publication_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "general_publication_photos_publication_sort_unique" ON "general_publication_photos" USING btree ("publication_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "general_publication_photos_storage_path_unique" ON "general_publication_photos" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "general_publication_upload_reservations_path_unique" ON "general_publication_upload_reservations" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "general_publication_upload_reservations_asset_unique" ON "general_publication_upload_reservations" USING btree ("publication_id","asset_id");--> statement-breakpoint
CREATE INDEX "general_publication_upload_reservations_author_idx" ON "general_publication_upload_reservations" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "general_publications_author_id_idx" ON "general_publications" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_dedupe_recipient_event_unique" ON "push_notification_dedupe" USING btree ("recipient_user_id","event_key");--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_publication_id_general_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."general_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_posts_group_created_id_idx" ON "community_posts" USING btree ("group_id","created_at","id");--> statement-breakpoint
CREATE INDEX "community_posts_publication_id_idx" ON "community_posts" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_group_publication_unique" ON "community_posts" USING btree ("group_id","publication_id") WHERE "community_posts"."publication_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_group_session_unique" ON "community_posts" USING btree ("group_id","workout_session_id") WHERE "community_posts"."workout_session_id" is not null;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_kind_check" CHECK ("community_posts"."kind" in ('workout', 'general'));--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_kind_shape_check" CHECK ((
        "community_posts"."kind" = 'workout'
        and "community_posts"."workout_session_id" is not null
        and "community_posts"."publication_id" is null
      ) or (
        "community_posts"."kind" = 'general'
        and "community_posts"."publication_id" is not null
        and "community_posts"."workout_session_id" is null
      ));--> statement-breakpoint
ALTER TABLE "crew_notification_prefs" ADD CONSTRAINT "crew_notification_prefs_alert_type_check" CHECK ("crew_notification_prefs"."alert_type" in ('crew_workout', 'crew_comment', 'crew_reaction', 'crew_post', 'mute_all'));