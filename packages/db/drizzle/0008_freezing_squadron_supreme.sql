CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"caption" text,
	"photo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_type" text NOT NULL,
	"name" text,
	"duration_minutes" integer,
	"effort" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sessions_effort_range_check" CHECK ("workout_sessions"."effort" is null or "workout_sessions"."effort" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_posts_group_created_at_idx" ON "community_posts" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_workout_session_id_idx" ON "community_posts" USING btree ("workout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_posts_group_session_unique" ON "community_posts" USING btree ("group_id","workout_session_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_occurred_at_idx" ON "workout_sessions" USING btree ("user_id","occurred_at");--> statement-breakpoint
INSERT INTO "workout_sessions" (
	"id",
	"user_id",
	"workout_type",
	"name",
	"duration_minutes",
	"effort",
	"occurred_at",
	"notes",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	"user_id",
	"workout_type",
	COALESCE(NULLIF(BTRIM("name"), ''), "title"),
	"duration_minutes",
	"effort",
	COALESCE("occurred_at", "completed_at"),
	NULL,
	"created_at",
	"updated_at"
FROM "workouts";--> statement-breakpoint
INSERT INTO "community_posts" (
	"id",
	"user_id",
	"group_id",
	"workout_session_id",
	"caption",
	"photo_path",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid(),
	"user_id",
	"group_id",
	"id",
	CASE
		WHEN NULLIF(BTRIM("caption"), '') IS NOT NULL THEN "caption"
		ELSE "notes"
	END,
	"photo_path",
	"created_at",
	"updated_at"
FROM "workouts";--> statement-breakpoint
DO $$
DECLARE
	legacy_count bigint;
	session_count bigint;
	post_count bigint;
BEGIN
	SELECT COUNT(*) INTO legacy_count FROM "workouts";
	SELECT COUNT(*) INTO session_count FROM "workout_sessions";
	SELECT COUNT(*) INTO post_count FROM "community_posts";

	IF session_count <> legacy_count THEN
		RAISE EXCEPTION 'workout_sessions backfill count mismatch: expected %, found %', legacy_count, session_count;
	END IF;

	IF post_count <> legacy_count THEN
		RAISE EXCEPTION 'community_posts backfill count mismatch: expected %, found %', legacy_count, post_count;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "workouts" legacy
		LEFT JOIN "workout_sessions" session ON session."id" = legacy."id"
		LEFT JOIN "community_posts" post ON post."workout_session_id" = session."id"
		WHERE session."id" IS NULL
			OR post."id" IS NULL
			OR session."user_id" <> legacy."user_id"
			OR post."user_id" <> legacy."user_id"
			OR post."group_id" <> legacy."group_id"
			OR session."occurred_at" <> COALESCE(legacy."occurred_at", legacy."completed_at")
			OR session."effort" IS DISTINCT FROM legacy."effort"
			OR post."caption" IS DISTINCT FROM CASE
				WHEN NULLIF(BTRIM(legacy."caption"), '') IS NOT NULL THEN legacy."caption"
				ELSE legacy."notes"
			END
			OR post."photo_path" IS DISTINCT FROM legacy."photo_path"
	) THEN
		RAISE EXCEPTION 'workout backfill field validation failed';
	END IF;
END $$;
