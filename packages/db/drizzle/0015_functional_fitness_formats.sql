ALTER TABLE "workout_sessions" ADD COLUMN "workout_format" text;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "format_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "format_interval_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "format_rounds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "time_cap_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "score_finished" boolean;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "score_time_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "score_rounds" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "score_reps" integer;--> statement-breakpoint
ALTER TABLE "set_results" ADD CONSTRAINT "set_results_distance_unit_check" CHECK (("set_results"."distance" is null) = ("set_results"."distance_unit" is null) and ("set_results"."distance_unit" is null or "set_results"."distance_unit" in ('m', 'km', 'mi'))) NOT VALID;--> statement-breakpoint
ALTER TABLE "set_results" VALIDATE CONSTRAINT "set_results_distance_unit_check";--> statement-breakpoint
ALTER TABLE "workout_session_metrics" ADD CONSTRAINT "workout_session_metrics_distance_unit_check" CHECK ("workout_session_metrics"."metric_type" <> 'distance' or "workout_session_metrics"."unit" in ('m', 'km', 'mi')) NOT VALID;--> statement-breakpoint
ALTER TABLE "workout_session_metrics" VALIDATE CONSTRAINT "workout_session_metrics_distance_unit_check";--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_format_check" CHECK ("workout_sessions"."workout_format" is null or ("workout_sessions"."workout_type" = 'functional_fitness' and "workout_sessions"."workout_format" in ('amrap', 'for_time', 'emom', 'rounds')));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_format_columns_null_check" CHECK ("workout_sessions"."workout_format" is not null or (
        "workout_sessions"."format_duration_seconds" is null
        and "workout_sessions"."format_interval_seconds" is null
        and "workout_sessions"."format_rounds" is null
        and "workout_sessions"."time_cap_seconds" is null
        and "workout_sessions"."score_finished" is null
        and "workout_sessions"."score_time_seconds" is null
        and "workout_sessions"."score_rounds" is null
        and "workout_sessions"."score_reps" is null
      ));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_positive_values_check" CHECK ((
        "workout_sessions"."format_duration_seconds" is null or "workout_sessions"."format_duration_seconds" > 0
      ) and (
        "workout_sessions"."format_interval_seconds" is null or "workout_sessions"."format_interval_seconds" > 0
      ) and (
        "workout_sessions"."format_rounds" is null or "workout_sessions"."format_rounds" > 0
      ) and (
        "workout_sessions"."time_cap_seconds" is null or "workout_sessions"."time_cap_seconds" > 0
      ) and (
        "workout_sessions"."score_time_seconds" is null or "workout_sessions"."score_time_seconds" > 0
      ) and (
        "workout_sessions"."score_rounds" is null or "workout_sessions"."score_rounds" >= 0
      ) and (
        "workout_sessions"."score_reps" is null or "workout_sessions"."score_reps" >= 0
      ));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_amrap_shape_check" CHECK ("workout_sessions"."workout_format" <> 'amrap' or (
        "workout_sessions"."time_cap_seconds" is null
        and "workout_sessions"."score_finished" is null
        and "workout_sessions"."score_time_seconds" is null
        and "workout_sessions"."format_interval_seconds" is null
        and "workout_sessions"."format_rounds" is null
        and ("workout_sessions"."score_reps" is null or "workout_sessions"."score_rounds" is not null)
      ));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_for_time_shape_check" CHECK ("workout_sessions"."workout_format" <> 'for_time' or (
        "workout_sessions"."format_duration_seconds" is null
        and "workout_sessions"."format_interval_seconds" is null
        and "workout_sessions"."score_rounds" is null
        and (
          (
            "workout_sessions"."score_finished" is null
            and "workout_sessions"."score_time_seconds" is null
            and "workout_sessions"."score_reps" is null
          ) or (
            "workout_sessions"."score_finished" = true
            and "workout_sessions"."score_time_seconds" is not null
            and "workout_sessions"."score_reps" is null
            and ("workout_sessions"."time_cap_seconds" is null or "workout_sessions"."score_time_seconds" <= "workout_sessions"."time_cap_seconds")
          ) or (
            "workout_sessions"."score_finished" = false
            and "workout_sessions"."score_reps" is not null
            and "workout_sessions"."score_time_seconds" is null
            and "workout_sessions"."time_cap_seconds" is not null
          )
        )
      ));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_emom_shape_check" CHECK ("workout_sessions"."workout_format" <> 'emom' or (
        "workout_sessions"."time_cap_seconds" is null
        and "workout_sessions"."score_finished" is null
        and "workout_sessions"."score_time_seconds" is null
        and "workout_sessions"."format_rounds" is null
      ));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_rounds_shape_check" CHECK ("workout_sessions"."workout_format" <> 'rounds' or (
        "workout_sessions"."format_duration_seconds" is null
        and "workout_sessions"."format_interval_seconds" is null
        and "workout_sessions"."time_cap_seconds" is null
        and "workout_sessions"."score_finished" is null
        and "workout_sessions"."score_rounds" is null
        and "workout_sessions"."score_reps" is null
      ));