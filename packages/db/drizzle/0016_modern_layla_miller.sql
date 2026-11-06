CREATE TABLE "crew_notification_prefs" (
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "crew_notification_prefs_user_id_group_id_alert_type_pk" PRIMARY KEY("user_id","group_id","alert_type"),
	CONSTRAINT "crew_notification_prefs_alert_type_check" CHECK ("crew_notification_prefs"."alert_type" in ('crew_workout', 'crew_comment', 'crew_reaction', 'mute_all'))
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "content_visible_after" timestamp with time zone DEFAULT '-infinity' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "photo_path" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crew_notification_prefs" ADD CONSTRAINT "crew_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_notification_prefs" ADD CONSTRAINT "crew_notification_prefs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_notification_prefs_group_id_idx" ON "crew_notification_prefs" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_group_active_idx" ON "group_members" USING btree ("group_id");