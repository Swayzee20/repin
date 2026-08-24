CREATE TABLE "session_movement_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"block_movement_id" uuid,
	"movement_id" uuid,
	"movement_name" text NOT NULL,
	"position" integer NOT NULL,
	"notes" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_movement_results_position_check" CHECK ("session_movement_results"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "set_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_movement_result_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reps" integer,
	"load" numeric(12, 3),
	"load_unit" text,
	"duration_seconds" integer,
	"distance" numeric(12, 3),
	"distance_unit" text,
	"calories" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"notes" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_results_position_check" CHECK ("set_results"."position" >= 0),
	CONSTRAINT "set_results_reps_check" CHECK ("set_results"."reps" is null or "set_results"."reps" >= 0),
	CONSTRAINT "set_results_load_check" CHECK ("set_results"."load" is null or "set_results"."load" >= 0),
	CONSTRAINT "set_results_duration_seconds_check" CHECK ("set_results"."duration_seconds" is null or "set_results"."duration_seconds" >= 0),
	CONSTRAINT "set_results_distance_check" CHECK ("set_results"."distance" is null or "set_results"."distance" >= 0),
	CONSTRAINT "set_results_calories_check" CHECK ("set_results"."calories" is null or "set_results"."calories" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout_session_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"metric_type" text NOT NULL,
	"label" text,
	"numeric_value" numeric(14, 3),
	"text_value" text,
	"unit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_session_metrics_position_check" CHECK ("workout_session_metrics"."position" >= 0),
	CONSTRAINT "workout_session_metrics_metric_type_check" CHECK ("workout_session_metrics"."metric_type" in ('duration', 'distance', 'calories', 'rounds', 'score', 'pace', 'other')),
	CONSTRAINT "workout_session_metrics_value_check" CHECK ("workout_session_metrics"."numeric_value" is not null or "workout_session_metrics"."text_value" is not null)
);
--> statement-breakpoint
ALTER TABLE "session_movement_results" ADD CONSTRAINT "session_movement_results_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_movement_results" ADD CONSTRAINT "session_movement_results_block_movement_id_block_movements_id_fk" FOREIGN KEY ("block_movement_id") REFERENCES "public"."block_movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_movement_results" ADD CONSTRAINT "session_movement_results_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_results" ADD CONSTRAINT "set_results_session_movement_result_id_session_movement_results_id_fk" FOREIGN KEY ("session_movement_result_id") REFERENCES "public"."session_movement_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_metrics" ADD CONSTRAINT "workout_session_metrics_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_movement_results_workout_session_id_idx" ON "session_movement_results" USING btree ("workout_session_id");--> statement-breakpoint
CREATE INDEX "session_movement_results_block_movement_id_idx" ON "session_movement_results" USING btree ("block_movement_id");--> statement-breakpoint
CREATE INDEX "session_movement_results_movement_id_idx" ON "session_movement_results" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_movement_results_session_position_unique" ON "session_movement_results" USING btree ("workout_session_id","position");--> statement-breakpoint
CREATE INDEX "set_results_session_movement_result_id_idx" ON "set_results" USING btree ("session_movement_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "set_results_movement_position_unique" ON "set_results" USING btree ("session_movement_result_id","position");--> statement-breakpoint
CREATE INDEX "workout_session_metrics_workout_session_id_idx" ON "workout_session_metrics" USING btree ("workout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_session_metrics_session_position_unique" ON "workout_session_metrics" USING btree ("workout_session_id","position");