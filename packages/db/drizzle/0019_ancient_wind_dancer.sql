CREATE TABLE "community_post_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_period_id" uuid NOT NULL,
	"source_session_id" uuid,
	"display_label" text NOT NULL,
	"display_value" text NOT NULL,
	"reached_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_goals_label_check" CHECK (length(btrim("community_post_goals"."display_label")) between 1 and 120),
	CONSTRAINT "community_post_goals_value_check" CHECK (length(btrim("community_post_goals"."display_value")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "goal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"definition_version" integer NOT NULL,
	"period_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"eligible_start" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"target_value" numeric(14, 3) NOT NULL,
	"credit_closes_at" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"completion_method" text,
	"reached_at" timestamp with time zone,
	"recorded_at" timestamp with time zone,
	"source_session_id" uuid,
	"source_set_id" uuid,
	"originating_post_id" uuid,
	"evidence" jsonb,
	"progress_value" numeric(14, 3),
	"celebrated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_periods_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goal_periods_state_check" CHECK ("goal_periods"."state" in ('pending', 'reached', 'invalidated')),
	CONSTRAINT "goal_periods_method_check" CHECK ("goal_periods"."completion_method" is null or "goal_periods"."completion_method" in ('auto', 'manual')),
	CONSTRAINT "goal_periods_target_positive_check" CHECK ("goal_periods"."target_value" > 0),
	CONSTRAINT "goal_periods_key_check" CHECK (length(btrim("goal_periods"."period_key")) between 1 and 64)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"metric" text NOT NULL,
	"sport_filter" text,
	"target_value" numeric(14, 3) NOT NULL,
	"display_unit" text,
	"pr_kind" text,
	"pr_key" text,
	"movement_id" uuid,
	"movement_name" text,
	"lane" text,
	"schedule" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"week_starts_on" text DEFAULT 'sunday' NOT NULL,
	"activation_at" timestamp with time zone NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"active_slot" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_kind_check" CHECK ("goals"."kind" in ('volume', 'time', 'lift')),
	CONSTRAINT "goals_metric_check" CHECK ("goals"."metric" in ('workout_count', 'distance', 'minutes', 'load', 'time')),
	CONSTRAINT "goals_schedule_check" CHECK ("goals"."schedule" in ('one_time', 'weekly', 'monthly')),
	CONSTRAINT "goals_state_check" CHECK ("goals"."state" in ('active', 'reached', 'expired', 'archived', 'needs_review')),
	CONSTRAINT "goals_week_starts_on_check" CHECK ("goals"."week_starts_on" = 'sunday'),
	CONSTRAINT "goals_target_positive_check" CHECK ("goals"."target_value" > 0),
	CONSTRAINT "goals_time_zone_check" CHECK (length(btrim("goals"."time_zone")) between 1 and 64),
	CONSTRAINT "goals_title_check" CHECK (length(btrim("goals"."title")) between 1 and 120),
	CONSTRAINT "goals_slot_state_check" CHECK ((
        "goals"."state" = 'active'
        and "goals"."active_slot" between 1 and 5
      ) or (
        "goals"."state" <> 'active'
        and "goals"."active_slot" is null
      )),
	CONSTRAINT "goals_definition_check" CHECK ((
        "goals"."kind" = 'volume'
        and "goals"."metric" in ('workout_count', 'distance', 'minutes')
        and "goals"."pr_kind" is null
        and "goals"."pr_key" is null
        and (
          (
            "goals"."schedule" in ('weekly', 'monthly')
          ) or (
            "goals"."schedule" = 'one_time'
            and "goals"."deadline_at" is not null
          )
        )
        and (
          "goals"."sport_filter" is null
          or (
            "goals"."metric" = 'distance'
            and "goals"."sport_filter" in ('run', 'walk', 'cycling')
          )
          or (
            "goals"."metric" in ('workout_count', 'minutes')
            and "goals"."sport_filter" in (
              'run', 'walk', 'cycling', 'strength_training', 'powerlifting',
              'hiit', 'functional_fitness', 'other'
            )
          )
        )
      ) or (
        "goals"."kind" = 'time'
        and "goals"."metric" = 'time'
        and "goals"."schedule" = 'one_time'
        and "goals"."pr_kind" = 'distance_time'
        and "goals"."pr_key" is not null
        and "goals"."sport_filter" in ('run', 'walk', 'cycling')
      ) or (
        "goals"."kind" = 'lift'
        and "goals"."metric" = 'load'
        and "goals"."schedule" = 'one_time'
        and "goals"."pr_kind" = 'heaviest_single'
        and "goals"."pr_key" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "community_post_goals" ADD CONSTRAINT "community_post_goals_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_goals" ADD CONSTRAINT "community_post_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_goals" ADD CONSTRAINT "community_post_goals_goal_period_id_goal_periods_id_fk" FOREIGN KEY ("goal_period_id") REFERENCES "public"."goal_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_goals" ADD CONSTRAINT "community_post_goals_source_session_id_workout_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_goals" ADD CONSTRAINT "community_post_goals_period_user_fk" FOREIGN KEY ("goal_period_id","user_id") REFERENCES "public"."goal_periods"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_source_session_id_workout_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_source_set_id_set_results_id_fk" FOREIGN KEY ("source_set_id") REFERENCES "public"."set_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_originating_post_id_community_posts_id_fk" FOREIGN KEY ("originating_post_id") REFERENCES "public"."community_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_periods" ADD CONSTRAINT "goal_periods_goal_user_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_goals_period_unique" ON "community_post_goals" USING btree ("goal_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_post_goals_post_period_unique" ON "community_post_goals" USING btree ("post_id","goal_period_id");--> statement-breakpoint
CREATE INDEX "community_post_goals_post_id_idx" ON "community_post_goals" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "community_post_goals_user_id_idx" ON "community_post_goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_periods_goal_version_key_unique" ON "goal_periods" USING btree ("goal_id","definition_version","period_key");--> statement-breakpoint
CREATE INDEX "goal_periods_user_id_idx" ON "goal_periods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_periods_goal_id_idx" ON "goal_periods" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_periods_source_session_id_idx" ON "goal_periods" USING btree ("source_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_user_active_slot_unique" ON "goals" USING btree ("user_id","active_slot") WHERE "goals"."active_slot" is not null;--> statement-breakpoint
CREATE INDEX "goals_user_state_idx" ON "goals" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "goals_user_activation_idx" ON "goals" USING btree ("user_id","activation_at");