CREATE TABLE "workout_session_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"segment_type" text NOT NULL,
	"distance" numeric(12, 3),
	"distance_unit" text,
	"duration_seconds" integer,
	"recovery_seconds" integer,
	"notes" text,
	"configuration" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_session_segments_position_check" CHECK ("workout_session_segments"."position" >= 0),
	CONSTRAINT "workout_session_segments_type_check" CHECK ("workout_session_segments"."segment_type" in ('work', 'recovery')),
	CONSTRAINT "workout_session_segments_distance_check" CHECK (("workout_session_segments"."distance" is null and "workout_session_segments"."distance_unit" is null) or ("workout_session_segments"."distance" > 0 and "workout_session_segments"."distance_unit" in ('m', 'km', 'mi'))),
	CONSTRAINT "workout_session_segments_duration_check" CHECK ("workout_session_segments"."duration_seconds" is null or "workout_session_segments"."duration_seconds" > 0),
	CONSTRAINT "workout_session_segments_recovery_check" CHECK ("workout_session_segments"."recovery_seconds" is null or "workout_session_segments"."recovery_seconds" > 0),
	CONSTRAINT "workout_session_segments_result_check" CHECK ("workout_session_segments"."distance" is not null or "workout_session_segments"."duration_seconds" is not null or "workout_session_segments"."recovery_seconds" is not null)
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "workout_subtype" text;--> statement-breakpoint
ALTER TABLE "workout_session_segments" ADD CONSTRAINT "workout_session_segments_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_session_segments_workout_session_id_idx" ON "workout_session_segments" USING btree ("workout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_session_segments_session_position_unique" ON "workout_session_segments" USING btree ("workout_session_id","position");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_subtype_check" CHECK ("workout_sessions"."workout_subtype" is null or ("workout_sessions"."workout_type" = 'run' and "workout_sessions"."workout_subtype" in ('distance', 'tempo', 'interval')));